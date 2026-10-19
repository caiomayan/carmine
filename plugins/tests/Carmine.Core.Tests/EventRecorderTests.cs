using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class EventRecorderTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 18, 18, 0, 0, TimeSpan.Zero);

    private static readonly PlayerRef Ana = new(76561198000000001, false, GameTeam.Ct);
    private static readonly PlayerRef Bia = new(76561198000000002, false, GameTeam.T);
    private static readonly PlayerRef Caio = new(76561198000000003, false, GameTeam.Ct);
    private static readonly PlayerRef Bot = new(0, true, GameTeam.T);

    private sealed class Fixture : IDisposable
    {
        public FakeTimeProvider Time { get; } = new(Now);
        public StubHandler Api { get; } = new(_ => throw new InvalidOperationException("sem rede"));
        public EventReporter Reporter { get; }
        public EventRecorder Recorder { get; }

        public Fixture()
        {
            Reporter = new EventReporter(CarmineApi.CreateClient(StubHandler.Options, Api), Time);
            Recorder = new EventRecorder(Reporter, Time);
        }

        public void Dispose() => Api.Dispose();
    }

    [Fact]
    public void Kill_de_um_humano_em_outro_leva_arma_headshot_e_assistencia()
    {
        using var f = new Fixture();

        f.Recorder.Kill(Ana, Bia, Caio, headshot: true, "ak47", warmup: false, teammatesAreEnemies: false);

        var kill = Assert.Single(f.Reporter.Snapshot().Kills);
        Assert.Equal("76561198000000001", kill.KillerSteamId);
        Assert.Equal("76561198000000002", kill.VictimSteamId);
        Assert.Equal("76561198000000003", kill.AssisterSteamId);
        Assert.True(kill.Headshot);
        Assert.Equal("ak47", kill.Weapon);
        Assert.False(kill.TeamKill);
        Assert.False(kill.Warmup);
        Assert.Equal(Now, kill.At);
        Assert.Equal(7, kill.Id.Version);
    }

    [Fact]
    public void Kill_em_aliado_e_marcada_mas_no_Deathmatch_todos_sao_inimigos()
    {
        using var f = new Fixture();

        f.Recorder.Kill(Ana, Caio, null, false, "ak47", false, teammatesAreEnemies: false);
        f.Recorder.Kill(Ana, Caio, null, false, "ak47", false, teammatesAreEnemies: true);

        Assert.Equal([true, false], f.Reporter.Snapshot().Kills.Select(k => k.TeamKill));
    }

    [Fact]
    public void Suicidio_nao_e_kill_em_aliado()
    {
        using var f = new Fixture();

        f.Recorder.Kill(Ana, Ana, null, false, "world", false, teammatesAreEnemies: false);

        var kill = Assert.Single(f.Reporter.Snapshot().Kills);
        Assert.False(kill.TeamKill);
        Assert.Equal(kill.KillerSteamId, kill.VictimSteamId);
    }

    [Fact]
    public void O_mundo_mata_sem_assassino_e_bot_vira_flag_sem_SteamID()
    {
        using var f = new Fixture();

        f.Recorder.Kill(null, Ana, null, false, "world", false, false);
        f.Recorder.Kill(Bot, Ana, null, false, "ak47", false, false);
        f.Recorder.Kill(Ana, Bot, null, false, "ak47", true, false);

        var kills = f.Reporter.Snapshot().Kills.ToList();
        Assert.Null(kills[0].KillerSteamId);
        Assert.False(kills[0].KillerIsBot);
        Assert.True(kills[1].KillerIsBot);
        Assert.Null(kills[1].KillerSteamId);
        Assert.True(kills[2].VictimIsBot);
        Assert.Null(kills[2].VictimSteamId);
        Assert.True(kills[2].Warmup);
    }

    [Fact]
    public void Bot_contra_bot_nao_sai_do_servidor()
    {
        using var f = new Fixture();

        f.Recorder.Kill(Bot, Bot, null, false, "ak47", false, false);
        f.Recorder.Kill(null, Bot, null, false, "world", false, false);

        Assert.Empty(f.Reporter.Snapshot().Kills);
    }

    [Fact]
    public void Dano_so_sai_de_humano_em_inimigo_humano()
    {
        using var f = new Fixture();

        f.Recorder.Damage(Ana, Bia, 27, warmup: false, teammatesAreEnemies: false);
        f.Recorder.Damage(Ana, Caio, 27, false, false);
        f.Recorder.Damage(Ana, Bot, 27, false, false);
        f.Recorder.Damage(Bot, Ana, 27, false, false);
        f.Recorder.Damage(Ana, Ana, 27, false, false);
        f.Recorder.Damage(Ana, Bia, 0, false, false);
        f.Recorder.Damage(Ana, Caio, 40, false, teammatesAreEnemies: true);

        Assert.Equal([27, 40], f.Reporter.Snapshot().Damages.Select(d => d.Amount));
    }

    [Fact]
    public void Fim_de_round_leva_quem_estava_no_comeco_com_o_time_e_o_vencedor()
    {
        using var f = new Fixture();

        f.Recorder.RoundStarted([Ana, Bia, Bot, new PlayerRef(76561198000000009, false, null)]);
        f.Recorder.RoundEnded(RoundWinner.Ct, warmup: false);

        var round = Assert.Single(f.Reporter.Snapshot().RoundEnds);
        Assert.Equal(RoundWinner.Ct, round.Winner);
        Assert.Equal(
            [("76561198000000001", GameTeam.Ct), ("76561198000000002", GameTeam.T)],
            round.Players.Select(p => (p.SteamId, p.Team)));
    }

    [Fact]
    public void Round_sem_ninguem_ou_ja_encerrado_nao_gera_evento()
    {
        using var f = new Fixture();

        f.Recorder.RoundEnded(RoundWinner.T, false);
        f.Recorder.RoundStarted([Ana]);
        f.Recorder.RoundEnded(RoundWinner.T, true);
        f.Recorder.RoundEnded(RoundWinner.T, false);

        var round = Assert.Single(f.Reporter.Snapshot().RoundEnds);
        Assert.True(round.Warmup);
    }

    [Fact]
    public void Sessao_comeca_na_entrada_e_termina_na_saida_com_o_mesmo_ID()
    {
        using var f = new Fixture();

        f.Recorder.PlayerJoined(Ana.SteamId);
        f.Recorder.PlayerJoined(Ana.SteamId);
        f.Time.Advance(TimeSpan.FromMinutes(20));
        f.Recorder.PlayerLeft(Ana.SteamId);
        f.Recorder.PlayerLeft(Ana.SteamId);

        var batch = f.Reporter.Snapshot();
        var start = Assert.Single(batch.SessionStarts);
        var end = Assert.Single(batch.SessionEnds);
        Assert.Equal(start.SessionId, end.SessionId);
        Assert.Equal(Now, end.StartedAt);
        Assert.Equal(Now.AddMinutes(20), end.At);
        Assert.NotEqual(start.Id, end.Id);
    }

    [Fact]
    public void Ao_sair_o_plugin_fecha_as_Sessoes_abertas()
    {
        using var f = new Fixture();
        f.Recorder.PlayerJoined(Ana.SteamId);
        f.Recorder.PlayerJoined(Bia.SteamId);
        f.Recorder.PlayerLeft(Bia.SteamId);

        f.Recorder.CloseAllSessions();
        f.Recorder.CloseAllSessions();

        Assert.Equal(2, f.Reporter.Snapshot().SessionEnds.Count);
    }
}
