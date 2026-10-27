using System.Text.RegularExpressions;

namespace CardApi;

public static class AgeRules
{
    public const int MinimumAge = 14;

    public static bool IsAtLeast(DateTime birthDate, DateTime today, int years = MinimumAge)
    {
        var age = today.Year - birthDate.Year;
        if (birthDate.Date > today.AddYears(-age).Date) age--;
        return age >= years;
    }
}

public static class ProfanityFilter
{
    // Compact list; the frontend runs the same check before saving.
    private static readonly string[] Words =
    {
        "fuck", "shit", "bitch", "asshole", "bastard", "dick", "pussy", "cunt", "slut", "whore",
        "nigger", "nigga", "faggot", "retard", "cock", "twat", "wanker", "bollocks", "porn", "nazi",
        "rape", "piss", "damn", "puta", "pula", "muie", "cacat", "fut", "merde", "scheisse"
    };

    // Words that are harmless as part of other words (e.g. "class", "assistant").
    private static readonly HashSet<string> ExactOnly = new() { "fut", "dick", "cock", "cunt", "damn", "rape", "pula", "nazi" };

    private static string Normalize(string input)
    {
        var s = input.ToLowerInvariant()
            .Replace('0', 'o').Replace('1', 'i').Replace('3', 'e')
            .Replace('4', 'a').Replace('5', 's').Replace('7', 't')
            .Replace('@', 'a').Replace('$', 's');
        return s;
    }

    public static bool Contains(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        var norm = Normalize(text);
        var tokens = Regex.Split(norm, @"[^a-z]+").Where(t => t.Length > 0).ToArray();
        // collapse repeated letters: "fuuuck" -> "fuck"
        var collapsed = tokens.Select(t => Regex.Replace(t, @"(.)\1+", "$1")).ToArray();
        foreach (var w in Words)
        {
            var wc = Regex.Replace(w, @"(.)\1+", "$1");
            foreach (var (t, c) in tokens.Zip(collapsed))
            {
                if (ExactOnly.Contains(w)) { if (t == w || c == wc) return true; }
                else if (t.Contains(w) || c.Contains(wc)) return true;
            }
        }
        return false;
    }
}

/// <summary>
/// Gift points and the shop (round 40). Prices and item ids live here, on the server, so they can't be
/// changed in the browser. The frontend has the pictures / contents of each item (frontend/src/shop/catalog.js).
/// </summary>
public static class GiftShop
{
    public const int PointsPerCard = 50;   // first download (picture or GIF) of a decorated card (round 42)
    public const int MaxRewardsPerDay = 10; // at most this many cards earn points per 24 h (the browser can't be trusted)
    public const int WelcomePoints = 100;  // every account starts with these

    public record Item(string Id, string Kind, int Price);

    public static readonly IReadOnlyList<Item> Items = new List<Item>
    {
        new("paper-pink", "paper", 60), new("paper-purple", "paper", 60), new("paper-red", "paper", 60),
        new("paper-blue", "paper", 60), new("paper-sky", "paper", 60), new("paper-mint", "paper", 60),
        new("paper-yellow", "paper", 60), new("paper-orange", "paper", 60), new("paper-kraft", "paper", 60),
        new("paper-black", "paper", 60),
        new("paper-all", "paper", 400),
        new("stickers-party", "stickers", 120), new("stickers-animals", "stickers", 120), new("stickers-sweets", "stickers", 120),
        new("tapes-pastel", "tapes", 100), new("tapes-bright", "tapes", 100),
        new("tools-golden", "tools", 150), new("tools-pastel", "tools", 150), new("tools-wooden", "tools", 150),
        new("tool-calligraphy", "tool", 200), new("tool-spray", "tool", 200), // brand-new drawing tools (round 41)
    };

    public static Item? Find(string? id) => Items.FirstOrDefault(i => i.Id == id);

    /// <summary>A card's key made in the browser (random letters/digits/dashes); "d-&lt;design id&gt;" for cards
    /// saved before round 42.</summary>
    public static bool IsCardKey(string? k) =>
        k is not null && System.Text.RegularExpressions.Regex.IsMatch(k, "^[a-z0-9-]{8,64}$");

    /// <summary>How many more cards may earn points now (rewards in the last 24 hours count).</summary>
    public static int RewardsLeft(IEnumerable<DateTime>? times, DateTime now) =>
        Math.Max(0, MaxRewardsPerDay - (times?.Count(t => t > now.AddHours(-24)) ?? 0));

    public static bool IsPaperColor(string? c) =>
        c is not null && System.Text.RegularExpressions.Regex.IsMatch(c, "^#[0-9a-fA-F]{6}$");
}
