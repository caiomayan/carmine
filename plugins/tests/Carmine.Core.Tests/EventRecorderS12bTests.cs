using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class EventRecorderS12bTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 18, 18, 0, 0, TimeSpan.Zero);

    private static readonly PlayerRef Ana = new(76561198000000001, false, GameTeam.Ct);
    private static readonly PlayerRef Bia = new(76561198000000002, false, GameTeam.T);
    private static readonly PlayerRef Bot = new(0, true, GameTeam.T);

    private sealed class Fixture : IDisposable
    {
        public FakeTimeProvider Time { get; } = new(Now);
        public StubHandler Api { get; } = new(_ => throw new InvalidOperationException("sem rede"));
        public MatchTracker Match { get; } = new();
        public EventReporter Reporter { get; }
        public EventRecorder Recorder { get; }

        public Fixture()
        {
            Reporter = new EventReporter(CarmineApi.CreateClient(StubHandler.Options, Api), Time);
            Recorder = new EventRecorder(Reporter, Time, Match);
        }

        public void Dispose() => Api.Dispose();
    }

    [Fact]
    public void Kill_leva_o_lado_do_assassino_humano_e_nada_para_o_mundo_ou_um_bot()
    {
        using var f = new Fixture();

        f.Recorder.Kill(Ana, Bia, null, false, "ak47", false, false);
        f.Recorder.Kill(Bia, Ana, null, false, "awp", false, false);
        f.Recorder.Kill(null, Ana, null, false, "world", false, false);
        f.Recorder.Kill(Bot, Ana, null, false, "ak47", false, false);
        f.Recorder.Kill(new PlayerRef(76561198000000009, false, null), Ana, null, false, "ak47", false, false);

        Assert.Equal(
            [GameTeam.Ct, GameTeam.T, null, null, null],
            f.Reporter.Snapshot().Kills.Select(k => k.KillerTeam));
    }

    [Fact]
    public void Fim_de_round_leva_mapa_numero_e_placar_depois_do_round()
    {
        using var f = new Fixture();
        f.Recorder.MapStarted("de_mirage");

        f.Recorder.RoundStarted([Ana, Bia]);
        f.Recorder.RoundEnded(RoundWinner.Ct, warmup: false);
        f.Recorder.RoundStarted([Ana, Bia]);
        f.Recorder.RoundEnded(RoundWinner.T, warmup: false);

        var rounds = f.Reporter.Snapshot().RoundEnds.ToList();
        Assert.All(rounds, r => Assert.Equal("de_mirage", r.Map));
        Assert.Equal([1, 2], rounds.Select(r => r.RoundNumber));
        Assert.Equal([1, 1], rounds.Select(r => r.ScoreCt));
        Assert.Equal([0, 1], rounds.Select(r => r.ScoreT));
    }

    [Fact]
    public void Aquecimento_ou_lado_sem_humanos_leva_o_mapa_mas_nao_o_placar()
    {
        using var f = new Fixture();
        f.Recorder.MapStarted("de_inferno");

        f.Recorder.RoundStarted([Ana, Bia]);
        f.Recorder.RoundEnded(RoundWinner.Ct, warmup: true);
        f.Recorder.RoundStarted([Ana]);
        f.Recorder.RoundEnded(RoundWinner.T, warmup: false);

        var rounds = f.Reporter.Snapshot().RoundEnds.ToList();
        Assert.All(rounds, r =>
        {
            Assert.Equal("de_inferno", r.Map);
            Assert.Null(r.RoundNumber);
            Assert.Null(r.ScoreCt);
            Assert.Null(r.ScoreT);
        });
        Assert.Equal(0, f.Match.RoundsPlayed);
    }

    [Fact]
    public void Sem_placar_de_times_o_Deathmatch_so_leva_o_mapa()
    {
        using var f = new Fixture();
        f.Recorder.MapStarted("de_dust2");

        f.Recorder.RoundStarted([Ana, Bia]);
        f.Recorder.RoundEnded(RoundWinner.Ct, warmup: false, teammatesAreEnemies: true);

        var round = Assert.Single(f.Reporter.Snapshot().RoundEnds);
        Assert.Equal("de_dust2", round.Map);
        Assert.Null(round.RoundNumber);
        Assert.Equal(0, f.Match.RoundsPlayed);
    }

    [Fact]
    public void Sem_o_tracker_o_round_sai_como_antes_com_o_mapa()
    {
        var clock = new FakeTimeProvider(Now);
        using var api = new StubHandler(_ => throw new InvalidOperationException("sem rede"));
        var reporter = new EventReporter(CarmineApi.CreateClient(StubHandler.Options, api), clock);
        var recorder = new EventRecorder(reporter, clock);

        recorder.RoundStarted([Ana, Bia]);
        recorder.RoundEnded(RoundWinner.Ct, warmup: false);

        var round = Assert.Single(reporter.Snapshot().RoundEnds);
        Assert.Null(round.RoundNumber);
        Assert.Null(round.ScoreCt);
    }

    [Fact]
    public void Sessao_leva_o_mapa_de_entrada_e_os_mapas_por_onde_passou_em_ordem_sem_repetir()
    {
        using var f = new Fixture();
        f.Recorder.MapStarted("de_dust2");
        f.Recorder.PlayerJoined(Ana.SteamId);

        f.Recorder.MapStarted("de_inferno");
        f.Recorder.MapStarted("de_dust2");
        f.Recorder.PlayerLeft(Ana.SteamId);

        var batch = f.Reporter.Snapshot();
        Assert.Equal("de_dust2", Assert.Single(batch.SessionStarts).Map);
        Assert.Equal(["de_dust2", "de_inferno"], Assert.Single(batch.SessionEnds).Maps);
    }

    [Fact]
    public void Quem_entra_depois_comeca_no_mapa_atual_e_nao_leva_os_anteriores()
    {
        using var f = new Fixture();
        f.Recorder.MapStarted("de_nuke");
        f.Recorder.MapStarted("de_ancient");

        f.Recorder.PlayerJoined(Bia.SteamId);
        f.Recorder.PlayerLeft(Bia.SteamId);

        var batch = f.Reporter.Snapshot();
        Assert.Equal("de_ancient", Assert.Single(batch.SessionStarts).Map);
        Assert.Equal(["de_ancient"], Assert.Single(batch.SessionEnds).Maps);
    }

    [Fact]
    public void Sessao_sem_mapa_conhecido_sai_sem_mapa_e_o_limite_de_mapas_e_respeitado()
    {
        using var f = new Fixture();
        f.Recorder.PlayerJoined(Ana.SteamId);
        for (var n = 0; n < 12; n++)
        {
            f.Recorder.MapStarted($"de_mapa{n}");
        }
        f.Recorder.PlayerLeft(Ana.SteamId);

        var batch = f.Reporter.Snapshot();
        Assert.Null(Assert.Single(batch.SessionStarts).Map);
        var end = Assert.Single(batch.SessionEnds);
        Assert.Equal(EventRecorder.MaxSessionMaps, end.Maps!.Count);
        Assert.Equal("de_mapa0", end.Maps.First());
    }

    [Fact]
    public void Nome_de_mapa_vazio_e_ignorado_e_o_longo_e_cortado_em_64()
    {
        using var f = new Fixture();

        f.Recorder.MapStarted("   ");
        Assert.Null(f.Recorder.Map);
        f.Recorder.MapStarted(new string('m', 100));
        Assert.Equal(64, f.Recorder.Map!.Length);
    }
}
