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
