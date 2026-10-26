using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using CardApi;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);

const int MaxDesigns = 20;
var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-only-secret-change-me-please-0123456789";
var mongoConn = builder.Configuration["Mongo:ConnectionString"] ?? "mongodb://localhost:27017";
var mongoDb = builder.Configuration["Mongo:Database"] ?? "birthdaycards";
var corsOrigins = (builder.Configuration["Cors:Origins"] ?? "http://localhost:3000").Split(',', StringSplitOptions.RemoveEmptyEntries);

builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 25 * 1024 * 1024);

builder.Services.AddSingleton<IMongoClient>(new MongoClient(mongoConn));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoClient>().GetDatabase(mongoDb));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoDatabase>().GetCollection<User>("users"));
builder.Services.AddSingleton(sp => sp.GetRequiredService<IMongoDatabase>().GetCollection<Design>("designs"));
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
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
});

var app = builder.Build();

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Indexes
{
    var users = app.Services.GetRequiredService<IMongoCollection<User>>();
    var designs = app.Services.GetRequiredService<IMongoCollection<Design>>();
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
        claims: new[] { new Claim(ClaimTypes.NameIdentifier, u.Id), new Claim(ClaimTypes.Name, u.DisplayName) },
        expires: DateTime.UtcNow.AddDays(7), signingCredentials: creds);
    return new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().WriteToken(token);
}

object UserDto(User u) => new { id = u.Id, email = u.Email, displayName = u.DisplayName, avatar = u.Avatar ?? "" };

const int MaxAvatarChars = 300_000; // a 256 px JPEG is ~20-60 KB; this leaves plenty of room

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

var auth = app.MapGroup("/api/auth").RequireRateLimiting("auth");

auth.MapPost("/register", async (RegisterRequest r, IMongoCollection<User> users, IPasswordHasher<User> hasher) =>
{
    var email = (r.Email ?? "").Trim().ToLowerInvariant();
    var name = (r.DisplayName ?? "").Trim();
    if (!System.Text.RegularExpressions.Regex.IsMatch(email, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
        return Results.BadRequest(new { error = "Please enter a valid email address." });
    if (name.Length < 2 || name.Length > 30)
        return Results.BadRequest(new { error = "Display name must be 2-30 characters." });
    if (ProfanityFilter.Contains(name))
        return Results.BadRequest(new { error = "Please choose a different display name." });
    if ((r.Password ?? "").Length < 8)
        return Results.BadRequest(new { error = "Password must be at least 8 characters." });
    if (r.BirthDate > DateTime.UtcNow || r.BirthDate.Year < 1900)
        return Results.BadRequest(new { error = "Please enter a valid birth date." });
    if (!AgeRules.IsAtLeast(r.BirthDate, DateTime.UtcNow))
        return Results.BadRequest(new { error = $"You must be at least {AgeRules.MinimumAge} years old to create an account." });
    if (await users.Find(u => u.Email == email).AnyAsync())
        return Results.Conflict(new { error = "An account with this email already exists." });

    var user = new User { Email = email, DisplayName = name, BirthDate = r.BirthDate.Date };
    user.PasswordHash = hasher.HashPassword(user, r.Password!);
    try { await users.InsertOneAsync(user); }
    catch (MongoWriteException) { return Results.Conflict(new { error = "An account with this email already exists." }); }
    return Results.Ok(new { token = CreateToken(user), user = UserDto(user) });
});

auth.MapPost("/login", async (LoginRequest r, IMongoCollection<User> users, IPasswordHasher<User> hasher) =>
{
    var email = (r.Email ?? "").Trim().ToLowerInvariant();
    var user = await users.Find(u => u.Email == email).FirstOrDefaultAsync();
    if (user is null || hasher.VerifyHashedPassword(user, user.PasswordHash, r.Password ?? "") == PasswordVerificationResult.Failed)
        return Results.Json(new { error = "Incorrect email or password." }, statusCode: 401);
    return Results.Ok(new { token = CreateToken(user), user = UserDto(user) });
});

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
            && Num(sh.Size, 8, 2000)));
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

designsApi.MapPost("/", async (DesignRequest r, ClaimsPrincipal p, IMongoCollection<Design> designs) =>
{
    if (Validate(r) is { } bad) return bad;
    var uid = Uid(p);
    if (await designs.CountDocumentsAsync(d => d.UserId == uid) >= MaxDesigns)
        return Results.Conflict(new { error = $"Your portfolio is full ({MaxDesigns} designs). Delete one to save a new design." });
    var d = new Design
    {
        UserId = uid, Title = r.Title?.Trim() ?? "", CardSize = r.CardSize, Background = r.Background,
        Image = r.Image, Mask = r.Mask ?? "", Thumbnail = r.Thumbnail, Texts = r.Texts ?? new(), Layers = r.Layers ?? new(), Palette = r.Palette ?? new(), Shapes = r.Shapes ?? new(), UpdatedAt = DateTime.UtcNow
    };
    await designs.InsertOneAsync(d);
    return Results.Ok(new { id = d.Id, updatedAt = d.UpdatedAt });
});

// Saving an existing design always reuses its slot.
designsApi.MapPut("/{id}", async (string id, DesignRequest r, ClaimsPrincipal p, IMongoCollection<Design> designs) =>
{
    if (Validate(r) is { } bad) return bad;
    var uid = Uid(p);
    var now = DateTime.UtcNow;
    var res = await designs.UpdateOneAsync(d => d.Id == id && d.UserId == uid,
        Builders<Design>.Update
            .Set(d => d.Title, r.Title?.Trim() ?? "").Set(d => d.CardSize, r.CardSize).Set(d => d.Background, r.Background)
            .Set(d => d.Image, r.Image).Set(d => d.Mask, r.Mask ?? "").Set(d => d.Thumbnail, r.Thumbnail)
            .Set(d => d.Texts, r.Texts ?? new()).Set(d => d.Layers, r.Layers ?? new()).Set(d => d.Palette, r.Palette ?? new()).Set(d => d.Shapes, r.Shapes ?? new()).Set(d => d.UpdatedAt, now));
    return res.MatchedCount == 0 ? Results.NotFound() : Results.Ok(new { id, updatedAt = now });
});

designsApi.MapDelete("/{id}", async (string id, ClaimsPrincipal p, IMongoCollection<Design> designs) =>
{
    var uid = Uid(p);
    var res = await designs.DeleteOneAsync(d => d.Id == id && d.UserId == uid);
    return res.DeletedCount == 0 ? Results.NotFound() : Results.NoContent();
});

app.Run();

public partial class Program { }
