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
    /// <summary>Every text typed onto the card; stored so the server can moderate it.</summary>
    public List<string> Texts { get; set; } = new();
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public record RegisterRequest(string Email, string DisplayName, string Password, DateTime BirthDate);
public record LoginRequest(string Email, string Password);
public record DesignRequest(string? Title, string CardSize, string Background, string Image, string? Mask, string Thumbnail, List<string>? Texts, Dictionary<string, string>? Layers);
