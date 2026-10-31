using Xunit;

namespace Carmine.Core.Tests;

public class HelpMessagesTests
{
    [Fact]
    public void O_Retake_lista_o_guns_e_o_awp_e_termina_nas_regras()
    {
        var lines = HelpMessages.Lines(ReservedSlotsMode.Retake);

        Assert.Contains(lines, l => l.StartsWith("!guns", StringComparison.Ordinal));
        Assert.Contains(lines, l => l.StartsWith("!awp", StringComparison.Ordinal));
        Assert.DoesNotContain(lines, l => l.StartsWith("!hs", StringComparison.Ordinal));
        Assert.Equal(HelpMessages.RulesLine, lines[^1]);
    }

    [Fact]
    public void O_Deathmatch_lista_hs_dmg_hud_sons_e_noprimary()
    {
        var lines = HelpMessages.Lines(ReservedSlotsMode.Deathmatch);

        foreach (var command in new[] { "!guns", "!hs", "!dmg", "!hud", "!hitsound", "!noprimary" })
        {
            Assert.Contains(lines, l => l.StartsWith(command, StringComparison.Ordinal));
        }
        Assert.DoesNotContain(lines, l => l.StartsWith("!awp", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData(ReservedSlotsMode.Retake)]
    [InlineData(ReservedSlotsMode.Deathmatch)]
    [InlineData(ReservedSlotsMode.Off)]
    public void Os_dois_Modos_tem_os_comandos_comuns(ReservedSlotsMode mode)
    {
        var lines = HelpMessages.Lines(mode);

        foreach (var command in new[] { "!ws", "!rank", "!stats", "!rtv", "!report", "!chat", "!vip" })
        {
            Assert.Contains(lines, l => l.StartsWith(command, StringComparison.Ordinal));
        }
    }
}
