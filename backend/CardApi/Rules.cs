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
