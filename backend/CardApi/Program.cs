using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using CardApi;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

const int MaxDesigns = 20;
var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-only-secret-change-me-please-0123456789";
var mongoConn = builder.Configuration["Mongo:ConnectionString"] ?? "mongodb://localhost:27017";
var mongoDb = builder.Configuration["Mongo:Database"] ?? "birthdaycards";
var corsOrigins = (builder.Configuration["Cors:Origins"] ?? "http://localhost:3000").Split(',', StringSplitOptions.RemoveEmptyEntries);
// Round 44: the password pepper (a secret mixed into every password hash, kept out of the database). Like the
// JWT key it comes from .env (made by deploy.sh / runlocal.sh); a weak or missing secret stops the server
// instead of running unsafely. Only `dotnet run` in Development may use the built-in ones.
var pepper = builder.Configuration["Security:PasswordPepper"] ?? "";
if (builder.Environment.IsDevelopment())
{
    if (pepper.Length < 32) pepper = "dev-only-pepper-change-me-please-0123456789";
}
else
{
    if (jwtKey.Length < 32 || jwtKey.StartsWith("dev-only") || jwtKey.StartsWith("replace-with"))
        throw new InvalidOperationException("Jwt:Key must be a random secret of at least 32 characters (see .env.example).");
    if (pepper.Length < 32 || pepper.StartsWith("replace-with"))
        throw new InvalidOperationException("Security:PasswordPepper must be a random secret of at least 32 characters (see .env.example).");
}
const string TokenIssuer = "giftit-api", TokenAudience = "giftit-web";
// Round 46: emails (Mailpit test inbox by default, Gmail etc. from .env) and the app's public address for links
var smtp = new SmtpSettings(
    builder.Configuration["Smtp:Host"] ?? "localhost", int.TryParse(builder.Configuration["Smtp:Port"], out var smtpPort) ? smtpPort : 1025,
    builder.Configuration["Smtp:User"] ?? "", builder.Configuration["Smtp:Password"] ?? "",
    string.IsNullOrWhiteSpace(builder.Configuration["Smtp:From"]) ? "GIFt it! <no-reply@giftit.local>" : builder.Configuration["Smtp:From"]!);
var publicUrl = (builder.Configuration["App:PublicUrl"] ?? corsOrigins[0]).TrimEnd('/');
// the sign-up codes are hashed with a key made from the pepper (a different key than the passwords use)
var codeKey = System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(pepper + "|email-codes"));

builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 25 * 1024 * 1024);

builder.Services.AddSingleton<IMongoClient>(new MongoClient(mongoConn));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>().GetDatabase(mongoDb));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoDatabase>().GetCollection<User>("users"));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoDatabase>().GetCollection<Design>("designs"));
builder.Services.AddSingleton(new PasswordSecurity(pepper));
builder.Services.AddSingleton(smtp);
builder.Services.AddSingleton<Mailer>();
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoDatabase>().GetCollection<PendingSignup>("pendingSignups"));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoDatabase>().GetCollection<Share>("shares"));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true, ValidIssuer = TokenIssuer,
            ValidateAudience = true, ValidAudience = TokenAudience,
            ValidateLifetime = true, RequireExpirationTime = true,
            ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 }, // only the algorithm we sign with ("none" etc. refused)
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("code", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 15, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Round 44: every request of a logged-in user counts as using the app (keeps the gift points from expiring –
// or takes them away first when the last use was more than GiftShop.PointsExpireDays days ago).
app.Use(async (ctx, next) =>
{
    var uid = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (uid is not null && ObjectId.TryParse(uid, out _))
        await Touch(uid, ctx.RequestServices.GetRequiredService<IMongoCollection<User>>());
    await next();
});

// Indexes
{
    var users = app.Services.GetRequiredService<IMongoCollection<User>>();
    var designs = app.Services.GetRequiredService<IMongoCollection<Design>>();
    var pendingIx = app.Services.GetRequiredService<IMongoCollection<PendingSignup>>();
    var sharesIx = app.Services.GetRequiredService<IMongoCollection<Share>>();
    _ = Task.Run(async () =>
    {
        for (var attempt = 0; attempt < 30; attempt++)
        {
            try
            {
                await users.Indexes.CreateOneAsync(new CreateIndexModel<User>(
                    Builders<User>.IndexKeys.Ascending(u => u.Email), new CreateIndexOptions { Unique = true }));
                await designs.Indexes.CreateOneAsync(new CreateIndexModel<Design>(
                    Builders<Design>.IndexKeys.Ascending(d => d.UserId)));
                // round 46: MongoDB removes unfinished sign-ups and old share links by itself
                await pendingIx.Indexes.CreateOneAsync(new CreateIndexModel<PendingSignup>(
                    Builders<PendingSignup>.IndexKeys.Ascending(x => x.ExpiresAt), new CreateIndexOptions { ExpireAfter = TimeSpan.Zero }));
                await sharesIx.Indexes.CreateOneAsync(new CreateIndexModel<Share>(
                    Builders<Share>.IndexKeys.Ascending(x => x.ExpiresAt), new CreateIndexOptions { ExpireAfter = TimeSpan.Zero }));
                await sharesIx.Indexes.CreateOneAsync(new CreateIndexModel<Share>(
                    Builders<Share>.IndexKeys.Ascending(x => x.UserId).Descending(x => x.CreatedAt)));
                return;
            }
            catch { await Task.Delay(2000); }
        }
    });
}

string CreateToken(User u)
{
    var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)), SecurityAlgorithms.HmacSha256);
    var token = new System.IdentityModel.Tokens.Jwt.JwtSecurityToken(
        issuer: TokenIssuer, audience: TokenAudience,
        claims: new[] { new Claim(ClaimTypes.NameIdentifier, u.Id), new Claim(ClaimTypes.Name, u.DisplayName) },
        expires: DateTime.UtcNow.AddDays(7), signingCredentials: creds);
    return new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().WriteToken(token);
}

object UserDto(User u) => new
{
    id = u.Id, email = u.Email, displayName = u.DisplayName, avatar = u.Avatar ?? "", points = u.Points, owned = u.Owned ?? new(),
    // round 44: when the points expire if the app isn't used until then, and points that just expired (shown once)
    pointsExpire = (u.LastActiveAt ?? DateTime.UtcNow).AddDays(GiftShop.PointsExpireDays), expiredPoints = u.ExpiredPoints,
};

// Round 44: the user is using the app now. If they hadn't for more than PointsExpireDays days, their points
// expire first (remembered in ExpiredPoints, so the app can tell them once). Returns the user as it is now.
async Task<User?> Touch(string uid, IMongoCollection<User> users)
{
    var now = DateTime.UtcNow;
    var u = await users.Find(x => x.Id == uid).FirstOrDefaultAsync();
    if (u is null) return null;
    if (GiftShop.PointsExpired(u.LastActiveAt, now) && u.Points > 0)
    {
        // only if nothing changed since it was read (another request may just have used or earned points)
        var after = await users.FindOneAndUpdateAsync(x => x.Id == uid && x.LastActiveAt == u.LastActiveAt && x.Points == u.Points,
            Builders<User>.Update.Set(x => x.Points, 0).Inc(x => x.ExpiredPoints, u.Points).Set(x => x.LastActiveAt, now),
            new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
        return after ?? await users.Find(x => x.Id == uid).FirstOrDefaultAsync();
    }
    // written at most once a minute: a busy app sends many requests
    if (u.LastActiveAt is null || now - u.LastActiveAt.Value > TimeSpan.FromMinutes(1))
    {
        await users.UpdateOneAsync(x => x.Id == uid, Builders<User>.Update.Set(x => x.LastActiveAt, now));
        u.LastActiveAt = now;
    }
    return u;
}

// The "your points expired" message is shown once: the answer still has it, the account no longer does.
async Task<User> TakeExpiryNotice(User u, IMongoCollection<User> users)
{
    if (u.ExpiredPoints > 0) await users.UpdateOneAsync(x => x.Id == u.Id, Builders<User>.Update.Set(x => x.ExpiredPoints, 0));
    return u;
}

// Accounts made before the gift shop existed get their welcome points once (round 40).
async Task<User> StartShop(User u, IMongoCollection<User> users)
{
    if (u.ShopStarted) return u;
    return await users.FindOneAndUpdateAsync(x => x.Id == u.Id && !x.ShopStarted,
        Builders<User>.Update.Set(x => x.ShopStarted, true).Inc(x => x.Points, GiftShop.WelcomePoints),
        new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After }) ?? u;
}


const int MaxAvatarChars = 300_000; // a 256 px JPEG is ~20-60 KB; this leaves plenty of room

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

var auth = app.MapGroup("/api/auth").RequireRateLimiting("auth");
// round 46: typing the emailed code has its own per-IP limit (each code also allows only 5 tries)
var codes = app.MapGroup("/api/auth").RequireRateLimiting("code");

// Round 46: creating an account has two steps. /register checks the details and emails a 6-digit code; the
// account is only made by /verify, with the right code (so the email address surely belongs to the user).
auth.MapPost("/register", async (RegisterRequest r, IMongoCollection<User> users, IMongoCollection<PendingSignup> pending, PasswordSecurity passwords, Mailer mailer, ILogger<Program> log) =>
{
    var email = (r.Email ?? "").Trim().ToLowerInvariant();
    var name = (r.DisplayName ?? "").Trim();
    if (!System.Text.RegularExpressions.Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
        return Results.BadRequest(new { error = "Please enter a valid email address." });
    if (name.Length < 2 || name.Length > 30)
        return Results.BadRequest(new { error = "Display name must be 2-30 characters." });
    if (ProfanityFilter.Contains(name))
        return Results.BadRequest(new { error = "Please choose a different display name." });
    if (PasswordRules.Problem(r.Password, email, name) is { } weak)
        return Results.BadRequest(new { error = weak });
    if (r.BirthDate > DateTime.UtcNow || r.BirthDate.Year < 1900)
        return Results.BadRequest(new { error = "Please enter a valid birth date." });
    if (!AgeRules.IsAtLeast(r.BirthDate, DateTime.UtcNow))
        return Results.BadRequest(new { error = $"You must be at least {AgeRules.MinimumAge} years old to create an account." });
    if (await users.Find(u => u.Email == email).AnyAsync())
        return Results.Conflict(new { error = "An account with this email already exists." });

    var now = DateTime.UtcNow;
    var old = await pending.Find(x => x.Email == email).FirstOrDefaultAsync();
    if (old is not null && now - old.SentAt < VerificationCode.ResendAfter)
        return Results.Json(new { error = "We just sent a code to this address – please wait a minute before asking for a new one." }, statusCode: 429);
    var code = VerificationCode.New();
    var p = new PendingSignup
    {
        Email = email, DisplayName = name, BirthDate = r.BirthDate.Date,
        PasswordHash = passwords.Hash(r.Password!), // Argon2id + its own random salt + the pepper (round 44)
        CodeHash = VerificationCode.Hash(email, code, codeKey), Sends = 1, SentAt = now, ExpiresAt = now + VerificationCode.ValidFor,
    };
    var (subject, html, text) = EmailTexts.Code(name, code);
    try { await mailer.SendAsync(email, subject, html, text); }
    catch (Exception ex)
    {
        log.LogWarning(ex, "Sign-up code email failed");
        return Results.Json(new { error = "We couldn't send the email with your code. Please check the address or try again later." }, statusCode: 503);
    }
    await pending.ReplaceOneAsync(x => x.Email == email, p, new ReplaceOptions { IsUpsert = true });
    return Results.Ok(new { pending = true, email, minutes = (int)VerificationCode.ValidFor.TotalMinutes, digits = VerificationCode.Digits });
});

// Round 46: the code from the email -> the account is created, logged in, and a confirmation email is sent.
codes.MapPost("/verify", async (VerifyRequest r, IMongoCollection<User> users, IMongoCollection<PendingSignup> pending, Mailer mailer, ILogger<Program> log) =>
{
    var email = (r.Email ?? "").Trim().ToLowerInvariant();
    var now = DateTime.UtcNow;
    var p = await pending.Find(x => x.Email == email).FirstOrDefaultAsync();
    if (p is null || p.ExpiresAt < now)
        return Results.BadRequest(new { error = "This code has run out. Please go back and send a new one.", expired = true });
    if (p.Tries >= VerificationCode.MaxTries)
        return Results.BadRequest(new { error = "Too many wrong codes. Please send a new one.", expired = true });
    if (!VerificationCode.Matches(p.CodeHash, email, r.Code ?? "", codeKey))
    {
        await pending.UpdateOneAsync(x => x.Email == email, Builders<PendingSignup>.Update.Inc(x => x.Tries, 1));
        var left = VerificationCode.MaxTries - p.Tries - 1;
        return Results.BadRequest(new { error = left > 0 ? $"That code isn't right. {left} {(left == 1 ? "try" : "tries")} left." : "That code isn't right. Please send a new one.", expired = left <= 0 });
    }
    // used once: whoever removes it first creates the account
    if (await pending.FindOneAndDeleteAsync(x => x.Email == email && x.CodeHash == p.CodeHash) is null)
        return Results.BadRequest(new { error = "This code was already used.", expired = true });
    var user = new User
    {
        Email = email, DisplayName = p.DisplayName, BirthDate = p.BirthDate, PasswordHash = p.PasswordHash,
        Points = GiftShop.WelcomePoints, ShopStarted = true, LastActiveAt = now, EmailVerified = true, EmailVerifiedAt = now, CreatedAt = now,
    };
    try { await users.InsertOneAsync(user); }
    catch (MongoWriteException) { return Results.Conflict(new { error = "An account with this email already exists." }); }
    var (subject, html, text) = EmailTexts.Welcome(user, publicUrl);
    _ = Task.Run(async () =>
    {
        try { await mailer.SendAsync(email, subject, html, text); }
        catch (Exception ex) { log.LogWarning(ex, "Welcome email failed"); } // the account works anyway
    });
    return Results.Ok(new { token = CreateToken(user), user = UserDto(user) });
});

// Round 46: "Send a new code" (at most once a minute and VerificationCode.MaxSends times).
codes.MapPost("/resend", async (ResendRequest r, IMongoCollection<PendingSignup> pending, Mailer mailer, ILogger<Program> log) =>
{
    var email = (r.Email ?? "").Trim().ToLowerInvariant();
    var now = DateTime.UtcNow;
    var p = await pending.Find(x => x.Email == email).FirstOrDefaultAsync();
    if (p is null || p.ExpiresAt < now) return Results.BadRequest(new { error = "Please go back and create the account again – it waited too long.", expired = true });
    if (now - p.SentAt < VerificationCode.ResendAfter)
        return Results.Json(new { error = $"Please wait {Math.Ceiling((VerificationCode.ResendAfter - (now - p.SentAt)).TotalSeconds)} seconds before asking for a new code." }, statusCode: 429);
    if (p.Sends >= VerificationCode.MaxSends) return Results.Json(new { error = "That's enough codes for now. Please try again later." }, statusCode: 429);
    var code = VerificationCode.New();
    var (subject, html, text) = EmailTexts.Code(p.DisplayName, code);
    try { await mailer.SendAsync(email, subject, html, text); }
    catch (Exception ex) { log.LogWarning(ex, "Sign-up code email failed"); return Results.Json(new { error = "We couldn't send the email. Please try again later." }, statusCode: 503); }
    await pending.UpdateOneAsync(x => x.Email == email, Builders<PendingSignup>.Update
        .Set(x => x.CodeHash, VerificationCode.Hash(email, code, codeKey)).Set(x => x.Tries, 0).Inc(x => x.Sends, 1)
        .Set(x => x.SentAt, now).Set(x => x.ExpiresAt, now + VerificationCode.ValidFor));
    return Results.Ok(new { sent = true, minutes = (int)VerificationCode.ValidFor.TotalMinutes });
});

auth.MapPost("/login", async (LoginRequest r, IMongoCollection<User> users, PasswordSecurity passwords) =>
{
    var email = (r.Email ?? "").Trim().ToLowerInvariant();
    var password = r.Password ?? "";
    var wrong = Results.Json(new { error = "Incorrect email or password." }, statusCode: 401);
    if (password.Length > PasswordRules.MaxLength) return wrong;
    var user = await users.Find(u => u.Email == email).FirstOrDefaultAsync();
    if (user is null) { passwords.VerifyNobody(password); return wrong; } // same time as a wrong password
    var now = DateTime.UtcNow;
    if (LoginLock.IsLocked(user.LockedUntil, now))
        return Results.Json(new { error = $"Too many wrong passwords for this account. Please wait {LoginLock.MinutesLeft(user.LockedUntil!.Value, now)} minutes and try again." }, statusCode: 429);
    var check = passwords.Verify(user.PasswordHash, password);
    if (check == PasswordSecurity.Result.Failed)
    {
        var after = await users.FindOneAndUpdateAsync(u => u.Id == user.Id, Builders<User>.Update.Inc(u => u.FailedLogins, 1),
            new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
        if (after is not null && after.FailedLogins >= LoginLock.MaxFailures)
        {
            await users.UpdateOneAsync(u => u.Id == user.Id,
                Builders<User>.Update.Set(u => u.FailedLogins, 0).Set(u => u.LockedUntil, now + LoginLock.LockFor));
            return Results.Json(new { error = $"Too many wrong passwords for this account. Please wait {(int)LoginLock.LockFor.TotalMinutes} minutes and try again." }, statusCode: 429);
        }
        return wrong;
    }
    var fix = Builders<User>.Update.Set(u => u.FailedLogins, 0).Set(u => u.LockedUntil, null);
    // an older or weaker hash is replaced by a new Argon2id one now that we know the password
    if (check == PasswordSecurity.Result.OkButRehash) fix = fix.Set(u => u.PasswordHash, passwords.Hash(password));
    await users.UpdateOneAsync(u => u.Id == user.Id, fix);
    user = await Touch(user.Id, users) ?? user;
    user = await TakeExpiryNotice(await StartShop(user, users), users);
    return Results.Ok(new { token = CreateToken(user), user = UserDto(user) });
});

// The logged-in user's details (points and bought items too) – the app asks for them when it starts.
app.MapGet("/api/account", async (ClaimsPrincipal p, IMongoCollection<User> users) =>
{
    var user = await users.Find(u => u.Id == p.FindFirstValue(ClaimTypes.NameIdentifier)).FirstOrDefaultAsync();
    if (user is null) return Results.NotFound();
    return Results.Ok(new { user = UserDto(await TakeExpiryNotice(await StartShop(user, users), users)) });
}).RequireAuthorization();

// ---------------------------------------------------------------- gift shop (round 40)
app.MapGet("/api/shop", () => Results.Ok(new
{
    pointsPerCard = GiftShop.PointsPerCard, welcomePoints = GiftShop.WelcomePoints, expireDays = GiftShop.PointsExpireDays,
    items = GiftShop.Items.Select(i => new { id = i.Id, kind = i.Kind, price = i.Price }),
}));

app.MapPost("/api/shop/buy", async (BuyRequest r, ClaimsPrincipal p, IMongoCollection<User> users) =>
{
    var item = GiftShop.Find(r.ItemId);
    if (item is null) return Results.BadRequest(new { error = "That item isn't in the shop." });
    var uid = p.FindFirstValue(ClaimTypes.NameIdentifier)!;
    // one atomic step: only if it isn't owned yet and there are enough points
    var user = await users.FindOneAndUpdateAsync(
        u => u.Id == uid && u.Points >= item.Price && !u.Owned.Contains(item.Id),
        Builders<User>.Update.Inc(u => u.Points, -item.Price).Push(u => u.Owned, item.Id),
        new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
    if (user is not null) return Results.Ok(new { user = UserDto(user) });
    var now = await users.Find(u => u.Id == uid).FirstOrDefaultAsync();
    if (now is null) return Results.NotFound();
    if (now.Owned.Contains(item.Id)) return Results.Conflict(new { error = "You already have this one." });
    return Results.BadRequest(new { error = $"Not enough gift points yet: you need {item.Price - now.Points} more." });
}).RequireAuthorization();

// Round 42: gift points come from DOWNLOADING a decorated card (picture or GIF), once per card. The browser
// only asks when the card has something on it; the server makes sure each card key pays once, cards that got
// their points by saving (rounds 40-41) get none again, and at most MaxRewardsPerDay cards pay per 24 hours.
app.MapPost("/api/points/download", async (DownloadRequest r, ClaimsPrincipal p, IMongoCollection<User> users, IMongoCollection<Design> designs) =>
{
    if (!GiftShop.IsCardKey(r.CardKey) || r.Kind is not ("picture" or "gif")) return Results.BadRequest(new { error = "Unknown card." });
    var uid = p.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var user = await users.Find(u => u.Id == uid).FirstOrDefaultAsync();
    if (user is null) return Results.NotFound();
    object Answer(User u, int earned, string? why = null) => new { pointsEarned = earned, points = u.Points, why, user = UserDto(u) };
    var key = r.CardKey!;
    if (user.RewardedCards.Contains(key)) return Results.Ok(Answer(user, 0, "already"));
    // a saved card from before round 42: its key is "d-<design id>", and it may already have had its points
    Design? old = null;
    if (key.StartsWith("d-"))
    {
        var designId = key[2..];
        old = ObjectId.TryParse(designId, out _) ? await designs.Find(d => d.Id == designId && d.UserId == uid).FirstOrDefaultAsync() : null;
        if (old is null) return Results.BadRequest(new { error = "Unknown card." });
        if (old.PointsGiven) return Results.Ok(Answer(user, 0, "already"));
    }
    var now = DateTime.UtcNow;
    if (GiftShop.RewardsLeft(user.RewardTimes, now) == 0) return Results.Ok(Answer(user, 0, "limit"));
    // one atomic step: only if this card hasn't paid yet
    var after = await users.FindOneAndUpdateAsync(u => u.Id == uid && !u.RewardedCards.Contains(key),
        Builders<User>.Update.Push(u => u.RewardedCards, key).Push(u => u.RewardTimes, now).Inc(u => u.Points, GiftShop.PointsPerCard),
        new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
    if (after is null) return Results.Ok(Answer(user, 0, "already"));
    if (old is not null) await designs.UpdateOneAsync(d => d.Id == old.Id, Builders<Design>.Update.Set(d => d.PointsGiven, true));
    return Results.Ok(Answer(after, GiftShop.PointsPerCard));
}).RequireAuthorization();

// Profile photo: set (small JPEG/PNG data URL made in the browser) or remove ("" = show the initial again).
app.MapPut("/api/account/avatar", async (AvatarRequest r, ClaimsPrincipal p, IMongoCollection<User> users) =>
{
    var avatar = r.Avatar ?? "";
    if (avatar.Length > 0 && (avatar.Length > MaxAvatarChars ||
        !(avatar.StartsWith("data:image/jpeg;base64,") || avatar.StartsWith("data:image/png;base64,"))))
        return Results.BadRequest(new { error = "Please choose a JPEG or PNG picture (it is made smaller automatically)." });
    var uid = p.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var user = await users.FindOneAndUpdateAsync(u => u.Id == uid, Builders<User>.Update.Set(u => u.Avatar, avatar),
        new FindOneAndUpdateOptions<User> { ReturnDocument = ReturnDocument.After });
    return user is null ? Results.NotFound() : Results.Ok(new { user = UserDto(user) });
}).RequireAuthorization();

// ---------------------------------------------------------------- sending a card to someone (round 46)
// A finished picture or GIF gets a public link (/s/<id>, kept ShareRules.KeepFor) that can go into WhatsApp,
// Facebook, Discord, Instagram, Gmail…; it can also be emailed from the app with the card attached.
app.MapPost("/api/shares", async (ShareRequest r, ClaimsPrincipal p, IMongoCollection<User> users, IMongoCollection<Share> shares) =>
{
    var file = ShareRules.Decode(r.Image);
    if (file is null) return Results.BadRequest(new { error = "Only a picture (PNG) or a GIF of the card can be sent (8 MB at most)." });
    var title = (r.Title ?? "").Trim();
    if (title.Length > 40 || ProfanityFilter.Contains(title)) title = "";
    var uid = p.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var user = await users.Find(u => u.Id == uid).FirstOrDefaultAsync();
    if (user is null) return Results.NotFound();
    var now = DateTime.UtcNow;
    if (await shares.CountDocumentsAsync(x => x.UserId == uid && x.CreatedAt > now.AddDays(-1)) >= ShareRules.MaxPerDay)
        return Results.Json(new { error = $"You've made {ShareRules.MaxPerDay} links today – that's the limit. Try again tomorrow." }, statusCode: 429);
    var s = new Share { Id = ShareRules.NewId(), UserId = uid, FromName = user.DisplayName, Title = title, ContentType = file.Value.Type, Data = file.Value.Data, CreatedAt = now, ExpiresAt = now + ShareRules.KeepFor };
    await shares.InsertOneAsync(s);
    return Results.Ok(new { id = s.Id, url = $"{publicUrl}/s/{s.Id}", imageUrl = $"{publicUrl}/api/shares/{s.Id}/image", expires = s.ExpiresAt });
}).RequireAuthorization();

app.MapGet("/api/shares/{id}/image", async (string id, IMongoCollection<Share> shares) =>
{
    if (!ShareRules.IsId(id)) return Results.NotFound();
    var s = await shares.Find(x => x.Id == id).FirstOrDefaultAsync();
    if (s is null || s.ExpiresAt < DateTime.UtcNow) return Results.NotFound();
    return Results.File(s.Data, s.ContentType, $"birthday-card.{(s.ContentType == "image/gif" ? "gif" : "png")}");
});

// The page the link opens (nginx sends /s/<id> here): the card, and preview tags for WhatsApp/Facebook/Discord.
app.MapGet("/api/shares/{id}/page", async (string id, IMongoCollection<Share> shares) =>
{
    var s = ShareRules.IsId(id) ? await shares.Find(x => x.Id == id).FirstOrDefaultAsync() : null;
    string E(string v) => System.Net.WebUtility.HtmlEncode(v);
    if (s is null || s.ExpiresAt < DateTime.UtcNow)
        return Results.Content($"<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\"><title>GIFt it!</title><body style=\"font-family:sans-serif;text-align:center;padding:40px;background:#fde68a\"><h1>This card isn't here any more</h1><p>Shared cards are kept for {ShareRules.KeepFor.Days} days.</p><p><a href=\"{E(publicUrl)}\">Make your own card with GIFt it!</a></p>", "text/html; charset=utf-8", statusCode: 404);
    var img = $"{publicUrl}/api/shares/{s.Id}/image";
    var title = $"{s.FromName} made you a birthday card! 🎂";
    var html = $@"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content=""width=device-width,initial-scale=1"">
<title>{E(title)}</title><meta name=robots content=noindex>
<meta property=og:title content=""{E(title)}""><meta property=og:description content=""Made with GIFt it! – birthday cards on a 3D desk."">
<meta property=og:image content=""{E(img)}""><meta property=og:type content=website><meta property=og:url content=""{E($"{publicUrl}/s/{s.Id}")}"">
<meta name=twitter:card content=summary_large_image><link rel=icon href=""/logo.jpeg"">
<style>body{{margin:0;font-family:Nunito,Arial,sans-serif;background:#fde68a;color:#3b2f2f;text-align:center}}main{{max-width:900px;margin:0 auto;padding:24px 16px}}img.card{{max-width:100%;border-radius:16px;box-shadow:0 10px 30px rgba(60,40,0,.25)}}a.btn{{display:inline-block;margin:8px;padding:10px 18px;border-radius:999px;background:#7a1730;color:#fff;text-decoration:none;font-weight:700}}a.btn.light{{background:#fff;color:#7a1730}}</style></head>
<body><main><img src=""/logo.jpeg"" alt=""GIFt it!"" width=96 height=96 style=""border-radius:8px""><h1>{E(title)}</h1>
<img class=card src=""/api/shares/{s.Id}/image"" alt=""Birthday card""><p>
<a class=""btn light"" href=""/api/shares/{s.Id}/image"" download>⬇ Save the card</a><a class=btn href=""/"">Make your own card</a></p></main></body></html>";
    return Results.Content(html, "text/html; charset=utf-8");
});

// Email the shared card from the app (attached + shown in the email), with a short message.
app.MapPost("/api/shares/{id}/email", async (string id, ShareEmailRequest r, ClaimsPrincipal p, IMongoCollection<User> users, IMongoCollection<Share> shares, Mailer mailer, ILogger<Program> log) =>
{
    var uid = p.FindFirstValue(ClaimTypes.NameIdentifier)!;
    var s = ShareRules.IsId(id) ? await shares.Find(x => x.Id == id && x.UserId == uid).FirstOrDefaultAsync() : null;
    if (s is null) return Results.NotFound(new { error = "Unknown card." });
    var to = (r.To ?? "").Trim();
    if (!ShareRules.IsEmail(to)) return Results.BadRequest(new { error = "Please enter a valid email address." });
    var message = (r.Message ?? "").Trim();
    if (message.Length > ShareRules.MaxMessage) return Results.BadRequest(new { error = $"The message is too long ({ShareRules.MaxMessage} characters max)." });
    if (ProfanityFilter.Contains(message)) return Results.BadRequest(new { error = "The message contains words that aren't allowed." });
    var now = DateTime.UtcNow;
    // one atomic step: only while this user has emails left today (stops the app being used to send spam)
    var before = await users.Find(u => u.Id == uid).FirstOrDefaultAsync();
    var sentToday = before?.EmailSendTimes.Count(t => t > now.AddDays(-1)) ?? ShareRules.MaxEmailsPerDay;
    var count = before?.EmailSendTimes.Count ?? 0;
    var user = sentToday >= ShareRules.MaxEmailsPerDay ? null : await users.FindOneAndUpdateAsync(
        u => u.Id == uid && u.EmailSendTimes.Count == count, // nothing sent meanwhile
        Builders<User>.Update.Push(u => u.EmailSendTimes, now));
    if (user is null) return Results.Json(new { error = $"You've sent {ShareRules.MaxEmailsPerDay} cards by email today – that's the limit. Try again tomorrow." }, statusCode: 429);
    var ext = s.ContentType == "image/gif" ? "gif" : "png";
    var (subject, html, text) = EmailTexts.Card(user.DisplayName, message, $"{publicUrl}/s/{s.Id}", "card");
    try
    {
        await mailer.SendAsync(to, subject, html, text, new[]
        {
            new Mailer.Attachment($"card.{ext}", s.ContentType, s.Data, Inline: true, ContentId: "card"),
            new Mailer.Attachment($"birthday-card.{ext}", s.ContentType, s.Data),
        });
    }
    catch (Exception ex)
    {
        log.LogWarning(ex, "Card email failed");
        await users.UpdateOneAsync(u => u.Id == uid, Builders<User>.Update.Pull(u => u.EmailSendTimes, now));
        return Results.Json(new { error = "We couldn't send the email. Please try again later." }, statusCode: 503);
    }
    return Results.Ok(new { sent = true, left = ShareRules.MaxEmailsPerDay - sentToday - 1 });
}).RequireAuthorization();

var designsApi = app.MapGroup("/api/designs").RequireAuthorization();

string Uid(ClaimsPrincipal p) => p.FindFirstValue(ClaimTypes.NameIdentifier)!;

var layerKeys = new HashSet<string> { "inObjects", "inInk", "inProtect", "outObjects", "outInk", "outProtect", "cut" };
var cardSizes = new HashSet<string> { "a4", "a5", "a6", "square" };

bool ValidShape(CardShape sh)
{
    bool Num(double v, double lo, double hi) => double.IsFinite(v) && v >= lo && v <= hi;
    return (sh.Face == "inside" || sh.Face == "outside")
        && System.Text.RegularExpressions.Regex.IsMatch(sh.Kind ?? "", "^[a-z0-9-]{1,24}$")
        && (sh.Id ?? "").Length <= 24
        && System.Text.RegularExpressions.Regex.IsMatch(sh.Color ?? "", "^#[0-9a-fA-F]{6}$")
        && Num(sh.X, -20000, 20000) && Num(sh.Y, -20000, 20000) && Num(sh.W, 1, 20000) && Num(sh.H, 1, 20000)
        && Num(sh.Rot, -10, 10) && Num(sh.Width, 1, 60)
        && (sh.Kind != "text" || (
            (sh.Text ?? "").Trim().Length is > 0 and <= 200 && !ProfanityFilter.Contains(sh.Text!)
            && System.Text.RegularExpressions.Regex.IsMatch(sh.Family ?? "", "^[A-Za-z0-9 ,'\"-]{1,120}$")
            && Num(sh.Size, 8, 2000)
            && (sh.Align is null or "" or "left" or "center" or "right" or "justify")
            && (sh.List is null or "" or "none" or "bullet" or "number")
            && Num(sh.LetterSpacing, -0.1, 1) && Num(sh.LineSpacing, 0.7, 4)));
}

IResult? Validate(DesignRequest r)
{
    if (!cardSizes.Contains(r.CardSize ?? "")) return Results.BadRequest(new { error = "Unknown card size." });
    if (r.Layers != null && r.Layers.Any(kv => !layerKeys.Contains(kv.Key) || !kv.Value.StartsWith("data:image/png;base64,")))
        return Results.BadRequest(new { error = "Invalid layer data." });
    if (r.Palette != null && (r.Palette.Count > 12 || r.Palette.Any(c => c.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(c, "^#[0-9a-fA-F]{6}$"))))
        return Results.BadRequest(new { error = "Invalid colour palette." });
    if (!r.Image.StartsWith("data:image/png;base64,") || !r.Thumbnail.StartsWith("data:image/"))
        return Results.BadRequest(new { error = "Invalid image data." });
    if (r.Mask is { Length: > 0 } && !r.Mask.StartsWith("data:image/png;base64,"))
        return Results.BadRequest(new { error = "Invalid mask data." });
    if (r.Shapes != null && (r.Shapes.Count > 500 || r.Shapes.Any(sh => !ValidShape(sh))))
        return Results.BadRequest(new { error = "Invalid shape data." });
    if (r.PaperColor is not null && !GiftShop.IsPaperColor(r.PaperColor))
        return Results.BadRequest(new { error = "Invalid paper colour." });
    if (!string.IsNullOrEmpty(r.CardKey) && !GiftShop.IsCardKey(r.CardKey))
        return Results.BadRequest(new { error = "Unknown card." });
    var title = r.Title?.Trim() ?? "";
    if (title.Length > 40) return Results.BadRequest(new { error = "Title is too long (40 characters max)." });
    if (ProfanityFilter.Contains(title))
        return Results.BadRequest(new { error = "The title contains words that aren't allowed." });
    if (r.Texts != null && r.Texts.Any(ProfanityFilter.Contains))
        return Results.BadRequest(new { error = "The card contains words that aren't allowed. Please remove them before saving." });
    return null;
}

designsApi.MapGet("/", async (ClaimsPrincipal p, IMongoCollection<Design> designs) =>
{
    var uid = Uid(p);
    var list = await designs.Find(d => d.UserId == uid)
        .SortByDescending(d => d.UpdatedAt)
        .Project(d => new { id = d.Id, title = d.Title, thumbnail = d.Thumbnail, updatedAt = d.UpdatedAt, cardSize = d.CardSize })
        .ToListAsync();
    return Results.Ok(new { max = MaxDesigns, designs = list });
});

designsApi.MapGet("/{id}", async (string id, ClaimsPrincipal p, IMongoCollection<Design> designs) =>
{
    var uid = Uid(p);
    var d = await designs.Find(x => x.Id == id && x.UserId == uid).FirstOrDefaultAsync();
    return d is null ? Results.NotFound() : Results.Ok(d);
});

designsApi.MapPost("/", async (DesignRequest r, ClaimsPrincipal p, IMongoCollection<Design> designs, IMongoCollection<User> users) =>
{
    if (Validate(r) is { } bad) return bad;
    var uid = Uid(p);
    if (await designs.CountDocumentsAsync(d => d.UserId == uid) >= MaxDesigns)
        return Results.Conflict(new { error = $"Your portfolio is full ({MaxDesigns} designs). Delete one to save a new design." });
    var d = new Design
    {
        UserId = uid, Title = r.Title?.Trim() ?? "", CardSize = r.CardSize, Background = r.Background,
        Image = r.Image, Mask = r.Mask ?? "", Thumbnail = r.Thumbnail, Texts = r.Texts ?? new(), Layers = r.Layers ?? new(), Palette = r.Palette ?? new(), Shapes = r.Shapes ?? new(), PaperColor = r.PaperColor ?? "#fffdf8", CardKey = r.CardKey ?? "", UpdatedAt = DateTime.UtcNow
    };
    await designs.InsertOneAsync(d);
    return Results.Ok(new { id = d.Id, updatedAt = d.UpdatedAt });
});

// Saving an existing design always reuses its slot.
designsApi.MapPut("/{id}", async (string id, DesignRequest r, ClaimsPrincipal p, IMongoCollection<Design> designs, IMongoCollection<User> users) =>
{
    if (Validate(r) is { } bad) return bad;
    var uid = Uid(p);
    var now = DateTime.UtcNow;
    var res = await designs.UpdateOneAsync(d => d.Id == id && d.UserId == uid,
        Builders<Design>.Update
            .Set(d => d.Title, r.Title?.Trim() ?? "").Set(d => d.CardSize, r.CardSize).Set(d => d.Background, r.Background)
            .Set(d => d.Image, r.Image).Set(d => d.Mask, r.Mask ?? "").Set(d => d.Thumbnail, r.Thumbnail)
            .Set(d => d.Texts, r.Texts ?? new()).Set(d => d.Layers, r.Layers ?? new()).Set(d => d.Palette, r.Palette ?? new()).Set(d => d.Shapes, r.Shapes ?? new()).Set(d => d.PaperColor, r.PaperColor ?? "#fffdf8").Set(d => d.CardKey, r.CardKey ?? "").Set(d => d.UpdatedAt, now));
    if (res.MatchedCount == 0) return Results.NotFound();
    return Results.Ok(new { id, updatedAt = now });
});

designsApi.MapDelete("/{id}", async (string id, ClaimsPrincipal p, IMongoCollection<Design> designs) =>
{
    var uid = Uid(p);
    var res = await designs.DeleteOneAsync(d => d.Id == id && d.UserId == uid);
    return res.DeletedCount == 0 ? Results.NotFound() : Results.NoContent();
});

app.Run();

public partial class Program { }
