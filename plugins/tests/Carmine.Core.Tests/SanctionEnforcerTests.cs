using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class SanctionEnforcerTests
{
    private const ulong Player = 76561198000000001;
    private const ulong Other = 76561198000000002;

    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 12, 15, 0, 0, TimeSpan.Zero));
    private readonly SanctionEnforcer _enforcer;

    public SanctionEnforcerTests() => _enforcer = new SanctionEnforcer(_time);

    private GameSanction Sanction(SanctionType type, TimeSpan? lasts = null, ulong steamId = Player, Guid? id = null) => new()
    {
        Id = id ?? Guid.NewGuid(),
        SteamId = steamId.ToString(System.Globalization.CultureInfo.InvariantCulture),
        Type = type,
        Category = SanctionCategory.Griefing,
        EndsAt = lasts is null ? null : _time.GetUtcNow() + lasts,
        Message = $"mensagem {type}",
    };

    [Fact]
    public void Ban_tira_o_jogador_com_a_mensagem_toda_vez_que_aparece()
    {
        var ban = Sanction(SanctionType.Ban, TimeSpan.FromDays(1));

        var first = _enforcer.Apply([ban], [Player, Other]);
        var again = _enforcer.Apply([ban], [Player, Other]);

        Assert.Equal([new SanctionAction.Kick(Player, "mensagem Ban", Ban: true)], first);
        Assert.Equal(first, again);
    }

    [Fact]
    public void Mute_liga_e_desliga_a_voz_e_avisa_so_no_inicio()
    {
        var mute = Sanction(SanctionType.Mute, TimeSpan.FromHours(1));

        var start = _enforcer.Apply([mute], [Player]);
        var steady = _enforcer.Apply([mute], [Player]);
        var revoked = _enforcer.Apply([], [Player]);

        Assert.Equal(
            [new SanctionAction.SetMuted(Player, true), new SanctionAction.Notify(Player, "mensagem Mute")],
            start);
        Assert.Empty(steady);
        Assert.Equal([new SanctionAction.SetMuted(Player, false)], revoked);
    }

    [Fact]
    public void Gag_bloqueia_o_chat_ate_o_horario_mesmo_sem_batimento()
    {
        _enforcer.Apply([Sanction(SanctionType.Gag, TimeSpan.FromMinutes(30))], [Player]);

        Assert.Equal("mensagem Gag", _enforcer.GagMessage(Player));
        Assert.Null(_enforcer.GagMessage(Other));
        _time.Advance(TimeSpan.FromMinutes(30));
        Assert.Null(_enforcer.GagMessage(Player));
    }

    [Fact]
    public void Mute_vencido_solta_a_voz_no_batimento_seguinte()
    {
        var mute = Sanction(SanctionType.Mute, TimeSpan.FromMinutes(1));
        _enforcer.Apply([mute], [Player]);

        _time.Advance(TimeSpan.FromMinutes(2));

        Assert.Equal([new SanctionAction.SetMuted(Player, false)], _enforcer.Apply([mute], [Player]));
    }

    [Fact]
    public void Kick_e_aviso_sao_executados_uma_vez_so_por_id()
    {
        var kick = Sanction(SanctionType.Kick);
        var warning = Sanction(SanctionType.Warning, steamId: Other);

        var first = _enforcer.Apply([kick, warning], [Player, Other]);
        var repeated = _enforcer.Apply([kick, warning], [Player, Other]);

        Assert.Equal(
            [new SanctionAction.Kick(Player, "mensagem Kick", Ban: false), new SanctionAction.Notify(Other, "mensagem Warning")],
            first);
        Assert.Empty(repeated);
    }

    [Fact]
    public void So_vale_para_os_jogadores_informados()
    {
        var actions = _enforcer.Apply([Sanction(SanctionType.Ban, steamId: Other)], [Player]);

        Assert.Empty(actions);
    }

    [Theory]
    [InlineData("!ws", true)]
    [InlineData("/ws", true)]
    [InlineData("!", false)]
    [InlineData("!ws seu lixo", false)]
    [InlineData("oi", false)]
    public void Comandos_de_chat_de_uma_palavra_passam_mesmo_com_gag(string text, bool command)
    {
        Assert.Equal(command, SanctionEnforcer.IsChatCommand(text));
    }

    [Fact]
    public void Ao_sair_o_estado_do_jogador_e_esquecido()
    {
        _enforcer.Apply([Sanction(SanctionType.Gag)], [Player]);

        _enforcer.Forget(Player);

        Assert.Null(_enforcer.GagMessage(Player));
    }
}
