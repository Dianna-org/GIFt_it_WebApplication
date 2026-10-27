using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace CardApi;

public class User
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public DateTime BirthDate { get; set; }
    /// <summary>Profile photo chosen by the user (small square JPEG/PNG data URL), "" = show the initial.</summary>
    public string Avatar { get; set; } = "";
    /// <summary>Gift points (round 40) and the shop items this account bought (kept for all its cards).</summary>
    public int Points { get; set; }
    public List<string> Owned { get; set; } = new();
    /// <summary>The welcome points were given (accounts made before round 40 get them on their next visit).</summary>
    public bool ShopStarted { get; set; }
    /// <summary>Round 42: cards (their CardKey) that already earned gift points by being downloaded, and when.</summary>
    public List<string> RewardedCards { get; set; } = new();
    public List<DateTime> RewardTimes { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Design
{
    [BsonId, BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = ObjectId.GenerateNewId().ToString();
    public string UserId { get; set; } = "";
    public string Title { get; set; } = "";
    public string CardSize { get; set; } = "a4";
    public string Background { get; set; } = "#fde68a";
    /// <summary>PNG data URL of the card artwork.</summary>
    public string Image { get; set; } = "";
    /// <summary>PNG data URL of the sticker-protection mask (so stickers stay unwritable after reload).</summary>
    public string Mask { get; set; } = "";
    public string Thumbnail { get; set; } = "";
    /// <summary>Editable layers (PNG data URLs): inObjects, inInk, inProtect, outObjects, outInk, outProtect, cut.</summary>
    public Dictionary<string, string> Layers { get; set; } = new();
    /// <summary>The project's "My colours" palette (hex colours, "" = empty slot).</summary>
    public List<string> Palette { get; set; } = new();
    /// <summary>Every text typed onto the card; stored so the server can moderate it.</summary>
    public List<string> Texts { get; set; } = new();
    /// <summary>Shapes-tool outlines, kept as objects so they can still be moved, resized and rotated after reopening.</summary>
    public List<CardShape> Shapes { get; set; } = new();
    /// <summary>Colour of the card's paper (bought in the shop; white by default).</summary>
    public string PaperColor { get; set; } = "#fffdf8";
    /// <summary>Rounds 40-41: the card got its gift points when it was saved. Since round 42 points come from
    /// downloading; a card that already got them this way gets none again.</summary>
    public bool PointsGiven { get; set; }
    /// <summary>Round 42: the card's own id made in the browser (the same before and after saving), so it earns
    /// download points only once.</summary>
    public string CardKey { get; set; } = "";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>One shape from the shapes tool: centre (X, Y), size (W, H) and rotation in canvas pixels / radians.</summary>
public class CardShape
{
    public string Face { get; set; } = "inside";
    public string Id { get; set; } = "";
    public string Kind { get; set; } = "";
    public double X { get; set; }
    public double Y { get; set; }
    public double W { get; set; }
    public double H { get; set; }
    public double Rot { get; set; }
    public string Color { get; set; } = "#333333";
    public double Width { get; set; } = 8;
    // text boxes (Kind "text") only
    public string? Text { get; set; }
    public string? Family { get; set; }
    public double Size { get; set; }
    public bool Bold { get; set; }
    public bool Italic { get; set; }
    // text box formatting (round 38)
    public string? Align { get; set; }
    public bool Underline { get; set; }
    public bool Strike { get; set; }
    public string? List { get; set; }
    public double LetterSpacing { get; set; }
    public double LineSpacing { get; set; } = 1.2;
}

public record RegisterRequest(string Email, string DisplayName, string Password, DateTime BirthDate);
public record LoginRequest(string Email, string Password);
public record AvatarRequest(string? Avatar);
public record BuyRequest(string? ItemId);
/// <summary>A decorated card was downloaded as a picture or a GIF (round 42: that is what earns gift points).</summary>
public record DownloadRequest(string? CardKey, string? Kind);
public record DesignRequest(string? Title, string CardSize, string Background, string Image, string? Mask, string Thumbnail, List<string>? Texts, Dictionary<string, string>? Layers, List<string>? Palette = null, List<CardShape>? Shapes = null, string? PaperColor = null, string? CardKey = null);
