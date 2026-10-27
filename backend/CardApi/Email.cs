using System.Net;
using System.Security.Cryptography;
using System.Text;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace CardApi;

/// <summary>SMTP settings (round 46). Locally the emails go to Mailpit (a free test inbox in Docker, opened at
/// http://localhost:8025); for real emails put Gmail's SMTP + an App Password in .env (see README).</summary>
public record SmtpSettings(string Host, int Port, string User, string Password, string From);

/// <summary>Sends the app's emails (round 46): sign-up codes, the account confirmation, cards sent to someone.</summary>
public class Mailer(SmtpSettings smtp, ILogger<Mailer> log)
{
    public record Attachment(string FileName, string ContentType, byte[] Data, bool Inline = false, string? ContentId = null);

    public virtual async Task SendAsync(string to, string subject, string html, string text, IEnumerable<Attachment>? files = null, string? replyName = null)
    {
        var msg = new MimeMessage();
        msg.From.Add(MailboxAddress.Parse(smtp.From));
        msg.To.Add(MailboxAddress.Parse(to));
        msg.Subject = subject;
        var body = new BodyBuilder { HtmlBody = html, TextBody = text };
        foreach (var f in files ?? Enumerable.Empty<Attachment>())
        {
            var part = f.Inline ? body.LinkedResources.Add(f.FileName, f.Data, ContentType.Parse(f.ContentType))
                                : body.Attachments.Add(f.FileName, f.Data, ContentType.Parse(f.ContentType));
            if (f.ContentId is not null) part.ContentId = f.ContentId;
        }
        msg.Body = body.ToMessageBody();

        using var client = new SmtpClient();
        client.Timeout = 20_000;
        // Auto: 465 = TLS straight away, 587 (Gmail) = STARTTLS, Mailpit's 1025 = plain (inside Docker only)
        await client.ConnectAsync(smtp.Host, smtp.Port, SecureSocketOptions.Auto);
        if (!string.IsNullOrEmpty(smtp.User)) await client.AuthenticateAsync(smtp.User, smtp.Password);
        await client.SendAsync(msg);
        await client.DisconnectAsync(true);
        log.LogInformation("Email \"{Subject}\" sent", subject); // the address itself isn't logged
    }
}

/// <summary>The 6-digit code emailed at sign-up (round 46). Only a keyed hash of it is stored.</summary>
public static class VerificationCode
{
    public const int Digits = 6, MaxTries = 5, MaxSends = 5;
    public static readonly TimeSpan ValidFor = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan ResendAfter = TimeSpan.FromSeconds(60);

    public static string New() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    /// <summary>HMAC-SHA256 of email + code with the server's secret: a copy of the database doesn't give the code.</summary>
    public static string Hash(string email, string code, byte[] key) =>
        Convert.ToHexString(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(email.ToLowerInvariant() + "|" + Clean(code))));

    public static bool Matches(string storedHash, string email, string code, byte[] key)
    {
        if (Clean(code).Length != Digits) return false;
        var a = Encoding.ASCII.GetBytes(Hash(email, code, key));
        var b = Encoding.ASCII.GetBytes(storedHash ?? "");
        return CryptographicOperations.FixedTimeEquals(a, b);
    }

    /// <summary>"123 456" or "123-456" typed by the user -> "123456".</summary>
    public static string Clean(string? code) => new((code ?? "").Where(char.IsAsciiDigit).ToArray());
}

/// <summary>Texts of the emails (round 46). Everything the user typed is HTML-encoded.</summary>
public static class EmailTexts
{
    private static string E(string? s) => WebUtility.HtmlEncode(s ?? "");

    private static string Frame(string inner) =>
        $"<div style=\"font-family:Nunito,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fffaf0;border-radius:16px;color:#3b2f2f\">" +
        $"<h1 style=\"margin:0 0 12px;color:#7a1730;font-size:26px\">🎁 GIFt it!</h1>{inner}" +
        "<p style=\"margin-top:28px;font-size:12px;color:#8a7b6b\">GIFt it! – make birthday cards on a 3D desk.</p></div>";

    public static (string Subject, string Html, string Text) Code(string name, string code) => (
        $"{code} is your GIFt it! code",
        Frame($"<p>Hi {E(name)}!</p><p>Here is the code to finish creating your GIFt it! account:</p>" +
              $"<p style=\"font-size:34px;letter-spacing:8px;font-weight:800;background:#fff;border:2px dashed #c9a227;border-radius:12px;padding:12px 18px;display:inline-block\">{code}</p>" +
              $"<p>It works for {(int)VerificationCode.ValidFor.TotalMinutes} minutes. If you didn't try to create an account, just ignore this email.</p>"),
        $"Hi {name}!\n\nYour GIFt it! code: {code}\nIt works for {(int)VerificationCode.ValidFor.TotalMinutes} minutes. If you didn't try to create an account, ignore this email.");

    public static (string Subject, string Html, string Text) Welcome(User u, string appUrl) => (
        "Welcome to GIFt it! – your account is ready",
        Frame($"<p>Hi {E(u.DisplayName)}, your account is ready! 🎉</p><p>These are your account details:</p>" +
              "<table style=\"border-collapse:collapse\">" +
              $"<tr><td style=\"padding:4px 12px 4px 0;color:#8a7b6b\">Display name</td><td><b>{E(u.DisplayName)}</b></td></tr>" +
              $"<tr><td style=\"padding:4px 12px 4px 0;color:#8a7b6b\">Email</td><td><b>{E(u.Email)}</b></td></tr>" +
              $"<tr><td style=\"padding:4px 12px 4px 0;color:#8a7b6b\">Birth date</td><td><b>{u.BirthDate:d MMMM yyyy}</b></td></tr>" +
              $"<tr><td style=\"padding:4px 12px 4px 0;color:#8a7b6b\">Created</td><td><b>{u.CreatedAt:d MMMM yyyy, HH:mm} (UTC)</b></td></tr>" +
              $"<tr><td style=\"padding:4px 12px 4px 0;color:#8a7b6b\">Gift points</td><td><b>{u.Points}</b> to start</td></tr></table>" +
              "<p>For your safety your password is not in this email – nobody at GIFt it! can see it.</p>" +
              $"<p><a href=\"{E(appUrl)}\" style=\"display:inline-block;background:#7a1730;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700\">Make a card</a></p>"),
        $"Hi {u.DisplayName}, your GIFt it! account is ready!\n\nDisplay name: {u.DisplayName}\nEmail: {u.Email}\nBirth date: {u.BirthDate:d MMMM yyyy}\nCreated: {u.CreatedAt:d MMMM yyyy, HH:mm} (UTC)\nGift points: {u.Points}\n\nYour password is not in this email.\n{appUrl}");

    public static (string Subject, string Html, string Text) Card(string from, string? message, string link, string cid) => (
        $"{from} made you a birthday card! 🎂",
        Frame($"<p><b>{E(from)}</b> made you a birthday card with GIFt it!</p>" +
              (string.IsNullOrWhiteSpace(message) ? "" : $"<p style=\"white-space:pre-wrap;background:#fff;border-left:4px solid #c9a227;padding:10px 14px\">{E(message)}</p>") +
              $"<p><img src=\"cid:{cid}\" alt=\"Birthday card\" style=\"max-width:100%;border-radius:12px\"></p>" +
              $"<p>The card is also attached, and online here: <a href=\"{E(link)}\">{E(link)}</a></p>"),
        $"{from} made you a birthday card with GIFt it!\n\n{message}\n\nThe card is attached, and online here: {link}");
}

/// <summary>Public links to a card someone wants to send (round 46).</summary>
public static class ShareRules
{
    public const int MaxBytes = 8 * 1024 * 1024, MaxPerDay = 30, MaxEmailsPerDay = 10, MaxMessage = 500;
    public static readonly TimeSpan KeepFor = TimeSpan.FromDays(30);

    /// <summary>12 random letters/digits (about 71 bits) – links can't be guessed.</summary>
    public static string NewId()
    {
        const string abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, 12).Select(_ => abc[RandomNumberGenerator.GetInt32(abc.Length)]).ToArray());
    }

    public static bool IsId(string? id) => id is { Length: 12 } && id.All(char.IsAsciiLetterOrDigit);

    /// <summary>Picture (PNG) or GIF from a data URL; null if it is anything else. Checks the file's own first bytes too.</summary>
    public static (string Type, byte[] Data)? Decode(string? dataUrl)
    {
        foreach (var type in new[] { "image/png", "image/gif" })
        {
            var prefix = $"data:{type};base64,";
            if (dataUrl is null || !dataUrl.StartsWith(prefix)) continue;
            byte[] data;
            try { data = Convert.FromBase64String(dataUrl[prefix.Length..]); } catch (FormatException) { return null; }
            if (data.Length is 0 or > MaxBytes) return null;
            var ok = type == "image/png"
                ? data.Length > 8 && data[0] == 0x89 && data[1] == (byte)'P' && data[2] == (byte)'N' && data[3] == (byte)'G'
                : data.Length > 6 && Encoding.ASCII.GetString(data, 0, 3) == "GIF";
            return ok ? (type, data) : null;
        }
        return null;
    }

    public static bool IsEmail(string? s) =>
        s is { Length: <= 254 } && System.Text.RegularExpressions.Regex.IsMatch(s, @"^[^@\s<>,;""]+@[^@\s<>,;""]+\.[^@\s<>,;""]+$");
}
