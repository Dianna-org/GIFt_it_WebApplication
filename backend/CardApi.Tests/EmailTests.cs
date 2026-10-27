using System.Text;
using CardApi;
using Xunit;

// Round 46: sign-up codes, share links, the emails' texts.
public class VerificationCodeTests
{
    private static readonly byte[] Key = Encoding.UTF8.GetBytes("test-key-0123456789-0123456789-0123");

    [Fact]
    public void NewCode_HasSixDigits()
    {
        for (var i = 0; i < 50; i++) Assert.Matches("^[0-9]{6}$", VerificationCode.New());
    }

    [Fact]
    public void RightCode_Matches_EvenWithSpacesAndOtherCase()
    {
        var h = VerificationCode.Hash("ana@test.io", "042137", Key);
        Assert.True(VerificationCode.Matches(h, "ANA@test.io", "042 137", Key));
        Assert.True(VerificationCode.Matches(h, "ana@test.io", "042-137", Key));
    }

    [Fact]
    public void WrongCode_OtherEmail_OtherKey_DontMatch()
    {
        var h = VerificationCode.Hash("ana@test.io", "042137", Key);
        Assert.False(VerificationCode.Matches(h, "ana@test.io", "042138", Key));
        Assert.False(VerificationCode.Matches(h, "bob@test.io", "042137", Key));
        Assert.False(VerificationCode.Matches(h, "ana@test.io", "042137", Encoding.UTF8.GetBytes("another-key-0123456789-0123456789")));
        Assert.False(VerificationCode.Matches(h, "ana@test.io", "04213", Key));
    }

    [Fact] public void StoredHash_IsNotTheCode() => Assert.DoesNotContain("042137", VerificationCode.Hash("ana@test.io", "042137", Key));
}

public class ShareRulesTests
{
    private const string Png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    [Fact]
    public void NewId_Is12UnguessableCharacters()
    {
        var ids = Enumerable.Range(0, 200).Select(_ => ShareRules.NewId()).ToList();
        Assert.All(ids, id => Assert.True(ShareRules.IsId(id)));
        Assert.Equal(200, ids.Distinct().Count());
    }

    [Theory]
    [InlineData("../../etc")]
    [InlineData("short")]
    [InlineData("abcdefghijk$")]
    public void BadIds_AreRefused(string id) => Assert.False(ShareRules.IsId(id));

    [Fact] public void Png_IsAccepted() => Assert.Equal("image/png", ShareRules.Decode(Png)!.Value.Type);

    [Fact]
    public void Gif_IsAccepted() =>
        Assert.Equal("image/gif", ShareRules.Decode("data:image/gif;base64," + Convert.ToBase64String(Encoding.ASCII.GetBytes("GIF89a....")))!.Value.Type);

    [Theory]
    [InlineData("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")]                // not a picture type we take
    [InlineData("data:image/png;base64,PGh0bWw+PC9odG1sPg==")]                // says PNG but is HTML
    [InlineData("data:image/gif;base64,!!!")]                               // broken
    [InlineData("javascript:alert(1)")]
    public void OtherFiles_AreRefused(string data) => Assert.Null(ShareRules.Decode(data));

    [Fact]
    public void TooBig_IsRefused()
    {
        var big = new byte[ShareRules.MaxBytes + 1]; big[0] = 0x89; big[1] = (byte)'P'; big[2] = (byte)'N'; big[3] = (byte)'G';
        Assert.Null(ShareRules.Decode("data:image/png;base64," + Convert.ToBase64String(big)));
    }

    [Theory]
    [InlineData("ana@gmail.com", true)]
    [InlineData("a.b+card@school.ro", true)]
    [InlineData("no-at-sign.com", false)]
    [InlineData("a@b.com, c@d.com", false)] // one person at a time
    [InlineData("<x>@y.com", false)]
    public void Emails(string email, bool ok) => Assert.Equal(ok, ShareRules.IsEmail(email));
}

public class EmailTextsTests
{
    [Fact]
    public void Card_EncodesWhatTheUserTyped()
    {
        var (subject, html, _) = EmailTexts.Card("<b>Ana</b>", "<script>alert(1)</script>", "http://localhost:3000/s/abc", "card");
        Assert.Contains("&lt;b&gt;Ana&lt;/b&gt;", html);
        Assert.DoesNotContain("<script>", html);
        Assert.Contains("cid:card", html);
        Assert.Contains("made you a birthday card", subject);
    }

    [Fact]
    public void Welcome_HasTheDetails_ButNotThePassword()
    {
        var u = new User { DisplayName = "Ana", Email = "ana@test.io", BirthDate = new DateTime(2000, 5, 17), PasswordHash = "$argon2id$secret", Points = 100 };
        var (_, html, text) = EmailTexts.Welcome(u, "http://localhost:3000");
        Assert.Contains("ana@test.io", html);
        Assert.Contains("17 May 2000", text);
        Assert.DoesNotContain("argon2id", html + text);
    }

    [Fact] public void Code_IsInTheSubject() => Assert.StartsWith("123456", EmailTexts.Code("Ana", "123456").Subject);
}
