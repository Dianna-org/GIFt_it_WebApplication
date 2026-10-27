using CardApi;
using Xunit;

public class AgeRulesTests
{
    private static readonly DateTime Today = new(2026, 10, 19);

    [Fact] public void Exactly14Today_IsAllowed() => Assert.True(AgeRules.IsAtLeast(new DateTime(2012, 10, 19), Today));
    [Fact] public void TurnsFourteenTomorrow_IsRejected() => Assert.False(AgeRules.IsAtLeast(new DateTime(2012, 10, 20), Today));
    [Fact] public void Adult_IsAllowed() => Assert.True(AgeRules.IsAtLeast(new DateTime(1990, 1, 1), Today));
    [Fact] public void Child_IsRejected() => Assert.False(AgeRules.IsAtLeast(new DateTime(2018, 5, 5), Today));
    [Fact] public void LeapDayBirthday_Handled() => Assert.True(AgeRules.IsAtLeast(new DateTime(2012, 2, 29), new DateTime(2026, 3, 1)));
}

public class ProfanityFilterTests
{
    [Theory]
    [InlineData("Happy birthday!")]
    [InlineData("Class of 2026, assistant manager")]
    [InlineData("Scunthorpe")]
    [InlineData("")]
    [InlineData(null)]
    public void CleanText_Passes(string? text) => Assert.False(ProfanityFilter.Contains(text));

    [Theory]
    [InlineData("what the fuck")]
    [InlineData("FUCK")]
    [InlineData("sh1t")]
    [InlineData("fuuuuck you")]
    [InlineData("you are a bitch")]
    public void BadText_IsBlocked(string text) => Assert.True(ProfanityFilter.Contains(text));
}

public class GiftShopTests
{
    [Fact] public void Prices_AreAsAgreed()
    {
        Assert.Equal(60, GiftShop.Find("paper-red")!.Price);
        Assert.Equal(400, GiftShop.Find("paper-all")!.Price);
        Assert.Equal(120, GiftShop.Find("stickers-party")!.Price);
        Assert.Equal(100, GiftShop.Find("tapes-pastel")!.Price);
        Assert.Equal(150, GiftShop.Find("tools-golden")!.Price);
        Assert.Equal(50, GiftShop.PointsPerCard);
        Assert.Equal(100, GiftShop.WelcomePoints);
    }
    [Fact]
    public void NewDrawingTools_AreToolsFor200()
    {
        foreach (var id in new[] { "tool-calligraphy", "tool-spray" })
        {
            var item = GiftShop.Find(id)!;
            Assert.Equal("tool", item.Kind);
            Assert.Equal(200, item.Price);
        }
    }
    [Theory]
    [InlineData("k8x2m1q9z7c4", true)]
    [InlineData("d-6ae0d06cba4fc1e2dfbe374a", true)]
    [InlineData("short", false)]
    [InlineData("Has Spaces 123", false)]
    [InlineData(null, false)]
    public void CardKey_IsChecked(string? k, bool ok) => Assert.Equal(ok, GiftShop.IsCardKey(k));
    [Fact]
    public void DownloadRewards_AreLimitedPer24Hours()
    {
        var now = new DateTime(2026, 10, 27, 12, 0, 0, DateTimeKind.Utc);
        Assert.Equal(GiftShop.MaxRewardsPerDay, GiftShop.RewardsLeft(null, now));
        var nine = Enumerable.Repeat(now.AddHours(-1), 9).ToList();
        Assert.Equal(1, GiftShop.RewardsLeft(nine, now));
        Assert.Equal(0, GiftShop.RewardsLeft(nine.Append(now).ToList(), now));
        Assert.Equal(GiftShop.MaxRewardsPerDay, GiftShop.RewardsLeft(Enumerable.Repeat(now.AddHours(-25), 30), now)); // older ones don't count
    }
    [Fact] public void Ids_AreUnique() => Assert.Equal(GiftShop.Items.Count, GiftShop.Items.Select(i => i.Id).Distinct().Count());
    [Fact] public void UnknownItem_IsNotFound() => Assert.Null(GiftShop.Find("free-points"));
    [Theory] [InlineData("#a855f7", true)] [InlineData("purple", false)] [InlineData(null, false)]
    public void PaperColor_IsChecked(string? c, bool ok) => Assert.Equal(ok, GiftShop.IsPaperColor(c));
}
