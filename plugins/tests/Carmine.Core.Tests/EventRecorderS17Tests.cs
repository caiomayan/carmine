using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

/// <summary>A coleta por round (S17): o contexto dos eventos, o início do round, a bomba e o fim do round.</summary>
public class EventRecorderS17Tests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 30, 18, 0, 0, TimeSpan.Zero);

    private static readonly PlayerRef Ana = new(76561198000000001, false, GameTeam.Ct);
    private static readonly PlayerRef Bia = new(76561198000000002, false, GameTeam.T);
    private static readonly PlayerRef Caio = new(76561198000000003, false, GameTeam.Ct);
    private static readonly PlayerRef BotCt = new(0, true, GameTeam.Ct);
    private static readonly PlayerRef BotT = new(0, true, GameTeam.T);

    private sealed class Fixture : IDisposable
    {
        public FakeTimeProvider Time { get; } = new(Now);
        public StubHandler Api { get; } = new(_ => throw new InvalidOperationException("sem rede"));
        public EventReporter Reporter { get; }
        public MatchTracker Match { get; } = new();
        public EventRecorder Recorder { get; }

        public Fixture()
        {
            Reporter = new EventReporter(CarmineApi.CreateClient(StubHandler.Options, Api), Time);
            Recorder = new EventRecorder(Reporter, Time, Match);
        }

        /// <summary>Abre um round de coleta: o round começa (freeze) e o freeze acaba.</summary>
        public void OpenRound(params PlayerRef[] players)
        {
            Recorder.RoundStarted(players, collect: true);
            Recorder.FreezeEnded(players.Select(p => new RoundPlayerInfo(p, 4750)));
        }

        public void Dispose() => Api.Dispose();
    }

    [Fact]
    public void O_inicio_do_round_leva_lado_equipamento_e_quantos_bots_ha_em_cada_lado()
    {
        using var f = new Fixture();

        f.Recorder.RoundStarted([Ana, Bia, BotCt, BotT, BotT], collect: true);
        f.Recorder.FreezeEnded(
        [
            new RoundPlayerInfo(Ana, 4750),
            new RoundPlayerInfo(Bia, 800),
            new RoundPlayerInfo(BotCt, 5000),
            new RoundPlayerInfo(BotT, 5000),
            new RoundPlayerInfo(BotT, 5000),
        ]);

        var start = Assert.Single(f.Reporter.Snapshot().RoundStarts ?? []);
        Assert.Equal(f.Match.MapPlayId, start.MapPlayId);
        Assert.Equal(1, start.RoundNumber);
        Assert.Equal(
            [("76561198000000001", GameTeam.Ct, 4750), ("76561198000000002", GameTeam.T, 800)],
            start.Players.Select(p => (p.SteamId, p.Team, p.EquipmentValue)));
        Assert.Equal(1, start.BotsCt);
        Assert.Equal(2, start.BotsT);
        Assert.Equal(Now.ToUnixTimeMilliseconds(), start.AtMs);
    }

    [Fact]
    public void Kill_e_dano_do_round_levem_o_mapa_jogado_o_numero_do_round_e_o_horario_em_ms()
    {
        using var f = new Fixture();
        f.OpenRound(Ana, Bia);
        f.Time.Advance(TimeSpan.FromSeconds(12));

        f.Recorder.Kill(Ana, Bia, null, true, "ak47", warmup: false, teammatesAreEnemies: false);
        f.Recorder.Damage(Ana, Bia, 100, warmup: false, teammatesAreEnemies: false);

        var batch = f.Reporter.Snapshot();
        var kill = Assert.Single(batch.Kills);
        var damage = Assert.Single(batch.Damages);
        foreach (var (map, round, at) in new[] { (kill.MapPlayId, kill.RoundNumber, kill.AtMs), (damage.MapPlayId, damage.RoundNumber, damage.AtMs) })
        {
            Assert.Equal(f.Match.MapPlayId, map);
            Assert.Equal(1, round);
            Assert.Equal(Now.AddSeconds(12).ToUnixTimeMilliseconds(), at);
        }
        Assert.Equal(GameTeam.T, kill.VictimTeam);
    }

    [Fact]
    public void O_numero_do_round_da_kill_e_o_mesmo_do_fim_do_round_e_cresce_no_seguinte()
    {
        using var f = new Fixture();

        f.OpenRound(Ana, Bia);
        f.Recorder.Kill(Ana, Bia, null, false, "ak47", false, false);
        f.Recorder.RoundEnded(RoundWinner.Ct, warmup: false);
        f.OpenRound(Ana, Bia);
        f.Recorder.Kill(Bia, Ana, null, false, "awp", false, false);
        f.Recorder.RoundEnded(RoundWinner.T, warmup: false);

        var batch = f.Reporter.Snapshot();
        Assert.Equal([1, 2], batch.Kills.Select(k => k.RoundNumber));
        Assert.Equal([1, 2], batch.RoundEnds.Select(r => r.RoundNumber));
        Assert.Equal([1, 2], (batch.RoundStarts ?? []).Select(r => r.RoundNumber));
        Assert.All(batch.RoundEnds, r => Assert.Equal(f.Match.MapPlayId, r.MapPlayId));
    }

    [Fact]
    public void Bot_contra_bot_dano_em_bot_e_em_aliado_saem_marcados_e_a_API_decide()
    {
        using var f = new Fixture();
        f.OpenRound(Ana, Bia, Caio, BotT);

        f.Recorder.Kill(BotT, BotCt, null, false, "ak47", false, false);
        f.Recorder.Kill(null, BotT, null, false, "world", false, false);
        f.Recorder.Damage(Ana, BotT, 27, false, false);
        f.Recorder.Damage(Ana, Caio, 27, false, false);
        f.Recorder.Damage(Ana, Bia, 27, false, false);

        var batch = f.Reporter.Snapshot();
        Assert.Equal(2, batch.Kills.Count);
        Assert.All(batch.Kills, k => Assert.Equal(1, k.RoundNumber));
        Assert.Equal(
            [(true, false), (false, true), (false, false)],
            batch.Damages.Select(d => (d.VictimIsBot, d.TeamDamage)));
    }

    [Fact]
    public void Dano_de_bot_nao_sai_porque_o_contrato_leva_o_SteamID_de_quem_atacou()
    {
        using var f = new Fixture();
        f.OpenRound(Ana, Bia);

        f.Recorder.Damage(BotT, Ana, 27, false, false);

        Assert.Empty(f.Reporter.Snapshot().Damages);
    }

    [Fact]
    public void Fora_de_um_round_de_coleta_nada_leva_contexto_nem_gera_inicio_ou_bomba()
    {
        using var f = new Fixture();

        // Aquecimento.
        f.Recorder.RoundStarted([Ana, Bia], collect: false);
        f.Recorder.FreezeEnded([new RoundPlayerInfo(Ana, 800), new RoundPlayerInfo(Bia, 800)]);
        f.Recorder.Kill(Ana, Bia, null, false, "ak47", warmup: true, false);
        f.Recorder.Bomb(BombEventKind.Plant, Ana, BombSite.A, warmup: true);
        // Round sem humanos nos dois lados (os sintéticos do cs2-retakes).
        f.Recorder.RoundStarted([Ana, Caio, BotT], collect: true);
        f.Recorder.FreezeEnded([new RoundPlayerInfo(Ana, 4750), new RoundPlayerInfo(Caio, 4750), new RoundPlayerInfo(BotT, 4750)]);
        f.Recorder.Kill(Ana, BotT, null, false, "ak47", false, false);
        f.Recorder.Bomb(BombEventKind.Explode, null, BombSite.B, warmup: false);

        var batch = f.Reporter.Snapshot();
        Assert.Empty(batch.RoundStarts ?? []);
        Assert.Empty(batch.Bombs ?? []);
        Assert.All(batch.Kills, k =>
        {
            Assert.Null(k.MapPlayId);
            Assert.Null(k.RoundNumber);
            Assert.Null(k.AtMs);
        });
    }

    [Fact]
    public void Sem_o_placar_de_times_nao_ha_coleta_por_round()
    {
        var time = new FakeTimeProvider(Now);
        using var api = new StubHandler(_ => throw new InvalidOperationException("sem rede"));
        var reporter = new EventReporter(CarmineApi.CreateClient(StubHandler.Options, api), time);
        var recorder = new EventRecorder(reporter, time);

        recorder.RoundStarted([Ana, Bia], collect: true);
        recorder.FreezeEnded([new RoundPlayerInfo(Ana, 800), new RoundPlayerInfo(Bia, 800)]);

        Assert.Empty(reporter.Snapshot().RoundStarts ?? []);
    }

    [Fact]
    public void A_bomba_leva_quem_plantou_ou_desarmou_e_o_site_e_a_explosao_nao_tem_autor()
    {
        using var f = new Fixture();
        f.OpenRound(Ana, Bia);

        f.Recorder.Bomb(BombEventKind.Plant, Bia, BombSite.A, warmup: false);
        f.Recorder.Bomb(BombEventKind.Defuse, Ana, BombSite.A, warmup: false);
        f.Recorder.Bomb(BombEventKind.Explode, Bia, null, warmup: false);

        var bombs = (f.Reporter.Snapshot().Bombs ?? []).ToList();
        Assert.Equal([BombEventKind.Plant, BombEventKind.Defuse, BombEventKind.Explode], bombs.Select(b => b.Kind));
        Assert.Equal(["76561198000000002", "76561198000000001", null], bombs.Select(b => b.SteamId));
        Assert.Equal([BombSite.A, BombSite.A, null], bombs.Select(b => b.Site));
        Assert.All(bombs, b =>
        {
            Assert.Equal(1, b.RoundNumber);
            Assert.Equal(f.Match.MapPlayId, b.MapPlayId);
        });
    }

    [Fact]
    public void O_fim_do_round_leva_motivo_duracao_e_quem_estava_vivo()
    {
        using var f = new Fixture();
        f.OpenRound(Ana, Bia);
        f.Time.Advance(TimeSpan.FromSeconds(95));

        f.Recorder.RoundEnded(
            RoundWinner.Ct,
            warmup: false,
            info: new RoundEndInfo(RoundEndReason.Bomb_defused, [Ana.SteamId, 0, Ana.SteamId]));

        var end = Assert.Single(f.Reporter.Snapshot().RoundEnds);
        Assert.Equal(RoundEndReason.Bomb_defused, end.Reason);
        Assert.Equal(95_000, end.DurationMs);
        Assert.Equal(["76561198000000001"], end.Alive);
        Assert.Equal(f.Match.MapPlayId, end.MapPlayId);
        Assert.Equal(Now.AddSeconds(95).ToUnixTimeMilliseconds(), end.AtMs);
    }

    [Fact]
    public void O_fim_de_um_round_fora_da_coleta_sai_como_antes()
    {
        using var f = new Fixture();
        f.Recorder.RoundStarted([Ana, Bia], collect: false);

        f.Recorder.RoundEnded(RoundWinner.T, warmup: false, info: new RoundEndInfo(RoundEndReason.Elimination, [Bia.SteamId]));

        var end = Assert.Single(f.Reporter.Snapshot().RoundEnds);
        Assert.Null(end.MapPlayId);
        Assert.Null(end.Reason);
        Assert.Null(end.DurationMs);
        Assert.Null(end.Alive);
    }

    [Fact]
    public void Os_detalhes_da_kill_e_do_acerto_vao_no_evento()
    {
        using var f = new Fixture();
        f.OpenRound(Ana, Bia);

        f.Recorder.Kill(
            Ana,
            Bia,
            Caio,
            true,
            "awp",
            false,
            false,
            new KillDetail(true, 2, true, false, true, 812.5f, new Point(1, 2, 3), new Point(float.NaN, 5, 6)));
        f.Recorder.Damage(Ana, Bia, 76, false, false, new DamageDetail("ak47", 1, 4, 71));

        var batch = f.Reporter.Snapshot();
        var kill = Assert.Single(batch.Kills);
        Assert.True(kill.FlashAssist);
        Assert.Equal(2, kill.Penetrated);
        Assert.True(kill.ThroughSmoke);
        Assert.False(kill.AttackerBlind);
        Assert.True(kill.NoScope);
        Assert.Equal(812.5, kill.Distance);
        Assert.Equal(1, kill.KillerPosition?.X);
        Assert.Null(kill.VictimPosition);
        var damage = Assert.Single(batch.Damages);
        Assert.Equal("76561198000000002", damage.VictimSteamId);
        Assert.Equal("ak47", damage.Weapon);
        Assert.Equal(1, damage.Hitgroup);
        Assert.Equal(4, damage.ArmorDamage);
        Assert.Equal(71, damage.HealthDamage);
        Assert.Equal(76, damage.Amount);
    }

    [Theory]
    [InlineData(1u, RoundEndReason.Bomb_exploded)]
    [InlineData(7u, RoundEndReason.Bomb_defused)]
    [InlineData(8u, RoundEndReason.Elimination)]
    [InlineData(9u, RoundEndReason.Elimination)]
    [InlineData(12u, RoundEndReason.Time)]
    [InlineData(10u, RoundEndReason.Other)]
    [InlineData(0u, RoundEndReason.Other)]
    [InlineData(99u, RoundEndReason.Other)]
    public void O_motivo_do_jogo_vira_o_do_contrato(uint gameReason, RoundEndReason expected)
    {
        Assert.Equal(expected, RoundEndReasons.Map(gameReason));
    }

    [Fact]
    public void O_mapa_jogado_muda_a_cada_mapa_partida_nova_e_hot_reload_mas_nao_dentro_do_round()
    {
        var match = new MatchTracker();
        var first = match.MapPlayId;

        match.RoundEnded(RoundWinner.Ct, warmup: false, humansOnBothSides: true);
        Assert.Equal(first, match.MapPlayId);

        match.Reset();
        var second = match.MapPlayId;
        Assert.NotEqual(first, second);
        Assert.Equal(7, second.Version);

        match.Adopt(new GameScore(5, 3, 2));
        Assert.NotEqual(second, match.MapPlayId);

        var third = match.MapPlayId;
        Assert.Equal(ReconcileOutcome.Restarted, match.Reconcile(new GameScore(0, 0, 0), warmup: false));
        Assert.NotEqual(third, match.MapPlayId);
    }
}
