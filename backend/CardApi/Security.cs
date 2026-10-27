using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;
using Microsoft.AspNetCore.Identity;

namespace CardApi;

/// <summary>
/// Password storage (round 44). Every password is hashed with Argon2id (the winner of the Password Hashing
/// Competition and OWASP's first choice): slow on purpose and memory-hard, so guessing passwords with
/// graphics cards is very expensive. Each password gets its own random 16-byte salt (two equal passwords never
/// give the same hash), and a secret "pepper" that is NOT in the database (it comes from the server's .env) is
/// mixed in too – a stolen copy of the database alone is not enough to start guessing.
/// Stored text: $argon2id$v=19$m=65536,t=3,p=1$&lt;salt base64&gt;$&lt;hash base64&gt;
/// Hashes from before round 44 (ASP.NET Identity, PBKDF2) still work and are replaced at the next log in.
/// </summary>
public sealed class PasswordSecurity
{
    public const int SaltBytes = 16, HashBytes = 32;
    public const int MemoryKiB = 64 * 1024, Iterations = 3, Parallelism = 1;
    private const string Prefix = "$argon2id$v=19$";

    private readonly byte[] _pepper;
    private readonly PasswordHasher<User> _legacy = new();
    // used when the email is unknown, so "no such account" takes as long as "wrong password"
    private readonly Lazy<string> _dummy;

    public PasswordSecurity(string pepper)
    {
        if (string.IsNullOrEmpty(pepper) || pepper.Length < 32) throw new ArgumentException("The password pepper must be at least 32 characters.");
        _pepper = Encoding.UTF8.GetBytes(pepper);
        _dummy = new(() => Hash("not-a-real-password-" + Guid.NewGuid()));
    }

    public enum Result { Failed, Ok, OkButRehash }

    public string Hash(string password, int memoryKiB = MemoryKiB, int iterations = Iterations)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Argon(password, salt, memoryKiB, iterations, Parallelism);
        return $"{Prefix}m={memoryKiB},t={iterations},p={Parallelism}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public Result Verify(string? stored, string password)
    {
        if (string.IsNullOrEmpty(stored)) { _ = Verify(_dummy.Value, password); return Result.Failed; }
        if (!stored.StartsWith(Prefix))
        {
            // an older ASP.NET Identity hash: check it the old way, then store a new Argon2id hash
            try
            {
                return _legacy.VerifyHashedPassword(new User(), stored, password) == PasswordVerificationResult.Failed
                    ? Result.Failed : Result.OkButRehash;
            }
            catch (FormatException) { return Result.Failed; }
        }
        var parts = stored[Prefix.Length..].Split('$');
        if (parts.Length != 3) return Result.Failed;
        var settings = parts[0].Split(',').Select(s => s.Split('=')).Where(kv => kv.Length == 2)
            .ToDictionary(kv => kv[0], kv => int.TryParse(kv[1], out var n) ? n : 0);
        if (!settings.TryGetValue("m", out var m) || !settings.TryGetValue("t", out var t) || !settings.TryGetValue("p", out var p)
            || m is < 8 * 1024 or > 1024 * 1024 || t is < 1 or > 20 || p is < 1 or > 16) return Result.Failed;
        byte[] salt, expected;
        try { salt = Convert.FromBase64String(parts[1]); expected = Convert.FromBase64String(parts[2]); }
        catch (FormatException) { return Result.Failed; }
        var actual = Argon(password, salt, m, t, p, expected.Length);
        // compared in constant time, so the answer's timing gives nothing away
        if (!CryptographicOperations.FixedTimeEquals(actual, expected)) return Result.Failed;
        return m < MemoryKiB || t < Iterations || salt.Length < SaltBytes ? Result.OkButRehash : Result.Ok;
    }

    /// <summary>Spends the same time as checking a real password (for log ins with an unknown email).</summary>
    public void VerifyNobody(string password) => Verify(_dummy.Value, password);

    private byte[] Argon(string password, byte[] salt, int memoryKiB, int iterations, int parallelism, int length = HashBytes)
    {
        // the same password typed on different keyboards/systems (e.g. "é" as one or two characters) gives the same hash
        var bytes = Encoding.UTF8.GetBytes(password.Normalize(NormalizationForm.FormKC));
        using var argon = new Argon2id(bytes)
        {
            Salt = salt, KnownSecret = _pepper, MemorySize = memoryKiB, Iterations = iterations, DegreeOfParallelism = parallelism,
        };
        try { return argon.GetBytes(length); }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }
}

/// <summary>Rules for new passwords (round 44), following the NIST / OWASP advice: long rather than "complex",
/// not one of the passwords everybody uses, and not the user's own name or email.</summary>
public static class PasswordRules
{
    public const int MinLength = 10, MaxLength = 128; // the upper limit stops huge passwords from slowing the server

    // the most used (and first guessed) passwords; anything containing one of them only gets past with more around it
    private static readonly HashSet<string> Common = new(StringComparer.OrdinalIgnoreCase)
    {
        "1234567890", "12345678910", "0123456789", "0987654321", "1111111111", "0000000000", "1234512345",
        "1q2w3e4r5t", "1qaz2wsx3edc", "qwertyuiop", "qwertyuiop1", "asdfghjkl1", "zxcvbnm123", "q1w2e3r4t5",
        "password10", "password12", "password123", "password1!", "password!1", "passw0rd123", "p@ssw0rd12",
        "iloveyou12", "iloveyou123", "princess12", "princess123", "sunshine12", "sunshine123", "football12",
        "football123", "baseball12", "superman12", "superman123", "starwars12", "letmein123", "welcome123",
        "welcome1234", "trustno123", "monkey1234", "dragon1234", "master1234", "shadow1234", "abc1234567",
        "abcdefghij", "abcdefgh12", "aaaaaaaaaa", "qwerty1234", "qwerty12345", "123qweasdzxc", "123123123123",
        "birthday12", "birthday123", "happybirthday", "happybirthday1", "giftit1234", "giftitgiftit",
        "changeme123", "administrator", "1234qwerasdf", "michael123", "charlie123", "jennifer12", "liverpool1",
        "chocolate1", "pokemon1234", "minecraft1", "minecraft123", "fortnite123", "computer12", "internet12",
    };

    /// <summary>What is wrong with this new password, or null when it is fine.</summary>
    public static string? Problem(string? password, string? email = null, string? name = null)
    {
        var pw = password ?? "";
        if (pw.Length < MinLength) return $"Password must be at least {MinLength} characters.";
        if (pw.Length > MaxLength) return $"Password must be at most {MaxLength} characters.";
        var lower = pw.ToLowerInvariant();
        if (Common.Contains(pw) || lower.Distinct().Count() < 4 || IsSequence(lower))
            return "This password is too easy to guess. Try a few words that only you would put together.";
        var local = (email ?? "").Split('@')[0].ToLowerInvariant();
        var who = (name ?? "").Trim().ToLowerInvariant().Replace(" ", "");
        if ((local.Length >= 3 && lower.Contains(local)) || (who.Length >= 3 && lower.Replace(" ", "").Contains(who)))
            return "Your password shouldn't contain your name or your email.";
        return null;
    }

    // "abcdefghij", "9876543210", "qwertyuiop" ...
    private static bool IsSequence(string s)
    {
        const string rows = "abcdefghijklmnopqrstuvwxyz 0123456789 qwertyuiop asdfghjkl zxcvbnm";
        var back = new string(rows.Reverse().ToArray());
        return rows.Contains(s) || back.Contains(s);
    }
}

/// <summary>Round 44: after too many wrong passwords in a row an account is locked for a while, so nobody can try
/// password after password on it (also from many different computers, which the per-IP limit can't stop).</summary>
public static class LoginLock
{
    public const int MaxFailures = 5;
    public static readonly TimeSpan LockFor = TimeSpan.FromMinutes(15);

    public static bool IsLocked(DateTime? lockedUntil, DateTime now) => lockedUntil is { } t && t > now;

    /// <summary>Minutes left to wait (at least 1), for the message.</summary>
    public static int MinutesLeft(DateTime lockedUntil, DateTime now) => Math.Max(1, (int)Math.Ceiling((lockedUntil - now).TotalMinutes));
}
