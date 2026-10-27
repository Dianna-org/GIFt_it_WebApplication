using CardApi;
using Microsoft.AspNetCore.Identity;
using Xunit;

// Round 44: password hashing (Argon2id + salt + pepper), password rules, account lock, gift points expiry.
public class PasswordSecurityTests
{
    private const string Pepper = "test-pepper-0123456789-0123456789-abcdef";
    private static readonly PasswordSecurity Passwords = new(Pepper);

    [Fact]
    public void Hash_IsArgon2id_WithSaltAndSettings()
    {
        var h = Passwords.Hash("correct horse battery");
        Assert.StartsWith("$argon2id$v=19$m=65536,t=3,p=1$", h);
        Assert.DoesNotContain("correct horse battery", h);
        Assert.Equal(PasswordSecurity.Result.Ok, Passwords.Verify(h, "correct horse battery"));
    }

    [Fact] public void WrongPassword_Fails() =>
        Assert.Equal(PasswordSecurity.Result.Failed, Passwords.Verify(Passwords.Hash("correct horse battery"), "correct horse batterY"));

    [Fact]
    public void SamePassword_GetsDifferentHashes_BecauseOfTheSalt() =>
        Assert.NotEqual(Passwords.Hash("same password here"), Passwords.Hash("same password here"));

    [Fact]
    public void AnotherPepper_CannotCheckThePassword()
    {
        var h = Passwords.Hash("correct horse battery");
        Assert.Equal(PasswordSecurity.Result.Failed, new PasswordSecurity(Pepper + "x").Verify(h, "correct horse battery"));
    }

    [Fact]
    public void ChangedHash_Fails()
    {
        var h = Passwords.Hash("correct horse battery");
        var tampered = h[..^4] + (h[^4] == 'A' ? "B" : "A") + h[^3..];
        Assert.Equal(PasswordSecurity.Result.Failed, Passwords.Verify(tampered, "correct horse battery"));
        Assert.Equal(PasswordSecurity.Result.Failed, Passwords.Verify("$argon2id$v=19$garbage", "x"));
        Assert.Equal(PasswordSecurity.Result.Failed, Passwords.Verify("", "x"));
    }

    [Fact]
    public void WeakerSettings_StillWork_ButAskForANewHash() =>
        Assert.Equal(PasswordSecurity.Result.OkButRehash, Passwords.Verify(Passwords.Hash("correct horse battery", 8 * 1024, 1), "correct horse battery"));

    [Fact]
    public void OldAspNetHash_StillWorks_ButAsksForANewHash()
    {
        var old = new PasswordHasher<User>().HashPassword(new User(), "password1");
        Assert.Equal(PasswordSecurity.Result.OkButRehash, Passwords.Verify(old, "password1"));
        Assert.Equal(PasswordSecurity.Result.Failed, Passwords.Verify(old, "password2"));
    }

    [Fact]
    public void SamePasswordTypedDifferently_GivesTheSameAnswer() =>
        // "é" as one character and as "e" + accent
        Assert.Equal(PasswordSecurity.Result.Ok, Passwords.Verify(Passwords.Hash("café au lait!"), "café au lait!"));

    [Fact] public void ShortPepper_IsRefused() => Assert.Throws<ArgumentException>(() => new PasswordSecurity("short"));
}

public class PasswordRulesTests
{
    [Theory]
    [InlineData("purple-otter-banjo")]
    [InlineData("My cat likes 7 boxes")]
    public void GoodPasswords_Pass(string pw) => Assert.Null(PasswordRules.Problem(pw, "ana@test.io", "Ana Pop"));

    [Theory]
    [InlineData("short1")]          // too short
    [InlineData("password123")]     // everybody uses it
    [InlineData("1234567890")]
    [InlineData("qwertyuiop")]      // keyboard row
    [InlineData("abcdefghijkl")]    // sequence
    [InlineData("aaaaaaaaaaaa")]    // the same letter
    [InlineData("abababab1111")]    // too few different characters
    [InlineData("anapopescu2000")]  // contains the email name
    [InlineData("I am Ana Pop!!")]  // contains the display name
    public void WeakPasswords_AreRefused(string pw) => Assert.NotNull(PasswordRules.Problem(pw, "anapopescu@test.io", "Ana Pop"));

    [Fact] public void TooLong_IsRefused() => Assert.NotNull(PasswordRules.Problem(new string('x', 60) + "Yz!9" + new string('q', 70)));
}

public class LoginLockTests
{
    private static readonly DateTime Now = new(2026, 10, 27, 12, 0, 0);
    [Fact] public void NotLocked_WithoutTime() => Assert.False(LoginLock.IsLocked(null, Now));
    [Fact] public void Locked_UntilTheTime() => Assert.True(LoginLock.IsLocked(Now.AddMinutes(3), Now));
    [Fact] public void Unlocked_AfterTheTime() => Assert.False(LoginLock.IsLocked(Now.AddSeconds(-1), Now));
    [Fact] public void MinutesLeft_RoundsUp() => Assert.Equal(3, LoginLock.MinutesLeft(Now.AddMinutes(2.2), Now));
}

public class PointsExpiryTests
{
    private static readonly DateTime Now = new(2026, 10, 27, 12, 0, 0);
    [Fact] public void UsedYesterday_Kept() => Assert.False(GiftShop.PointsExpired(Now.AddDays(-1), Now));
    [Fact] public void UsedExactly30DaysAgo_Kept() => Assert.False(GiftShop.PointsExpired(Now.AddDays(-30), Now));
    [Fact] public void Unused31Days_Expired() => Assert.True(GiftShop.PointsExpired(Now.AddDays(-31), Now));
    [Fact] public void OldAccount_StartsCountingNow() => Assert.False(GiftShop.PointsExpired(null, Now));
}
