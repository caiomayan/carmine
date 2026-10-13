using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class ReservedSlotsTests
{
    private const ulong Vip = 76561198000000100;
    private const string Vacancy = "Retake · Mirage (SP·2): connect 10.0.0.1:27017";

    private readonly FakeTimeProvider _time = new(new DateTimeOffset(2026, 10, 13, 20, 0, 0, TimeSpan.Zero));

    private static ulong P(int n) => 76561198000000000UL + (ulong)n;

    private ReservedSlots Retake(int publicSlots = 3) => new(ReservedSlotsMode.Retake, publicSlots, _time);

    private ReservedSlots Deathmatch(int publicSlots = 3) => new(ReservedSlotsMode.Deathmatch, publicSlots, _time);

    /// <summary>Entram em ordem, um segundo de diferença, e a API confirma cada um.</summary>
    private void Join(ReservedSlots slots, ulong steamId, bool isVip = false, int? humans = null)
    {
        _time.Advance(TimeSpan.FromSeconds(1));
        slots.OnJoin(steamId);
        slots.OnConnectResult(steamId, isVip, humans ?? 1);
    }

    private static SlotPlayer Playing(ulong steamId) => new(steamId, IsSpectator: false);

    private static SlotPlayer Watching(ulong steamId) => new(steamId, IsSpectator: true);

    [Fact]
    public void Deathmatch_lotado_tira_na_hora_quem_nao_e_VIP_e_deixa_o_VIP_na_vaga_extra()
    {
        var slots = Deathmatch(publicSlots: 3);
        foreach (var n in new[] { 1, 2, 3 })
        {
            Join(slots, P(n), humans: n);
        }

        slots.OnJoin(Vip);
        var vip = slots.OnConnectResult(Vip, isVip: true, humans: 4);
        slots.OnJoin(P(4));
        var outsider = slots.OnConnectResult(P(4), isVip: false, humans: 5);

        Assert.False(vip);
        Assert.True(outsider);
    }

    [Fact]
    public void Deathmatch_nunca_tira_ninguem_no_fim_do_round()
    {
        var slots = Deathmatch(publicSlots: 1);
        Join(slots, P(1), humans: 1);
        Join(slots, Vip, isVip: true, humans: 2);

        Assert.Empty(slots.OnRoundEnd([Watching(P(1)), Playing(Vip)], Vacancy));
    }

    [Fact]
    public void Sem_lotar_ninguem_sai()
    {
        var slots = Retake(publicSlots: 3);

        Join(slots, P(1), humans: 1);
        slots.OnJoin(P(2));

        Assert.False(slots.OnConnectResult(P(2), isVip: false, humans: 3));
    }

    [Fact]
    public void Retake_lotado_tira_na_hora_quem_nao_e_VIP_da_vaga_extra()
    {
        var slots = Retake(publicSlots: 3);

        slots.OnJoin(P(4));

        Assert.True(slots.OnConnectResult(P(4), isVip: false, humans: 4));
    }

    [Fact]
    public void A_mensagem_de_lotado_indica_o_outro_servidor_quando_ha_vaga()
    {
        Assert.Equal(
            "Servidor lotado: a vaga extra é reservada para VIP. Há vaga em: " + Vacancy + ". Com o VIP, sua vaga é garantida.",
            ReservedSlots.FullMessage(Vacancy));
        Assert.Equal(
            "Servidor lotado: a vaga extra é reservada para VIP. Com o VIP, sua vaga é garantida.",
            ReservedSlots.FullMessage(null));
    }

    [Fact]
    public void Retake_com_VIP_na_vaga_extra_tira_alguem_so_no_fim_do_round()
    {
        var slots = Retake(publicSlots: 3);
        foreach (var n in new[] { 1, 2, 3 })
        {
            Join(slots, P(n));
        }

        slots.OnJoin(Vip);
        var onConnect = slots.OnConnectResult(Vip, isVip: true, humans: 4);
        var waiting = slots.HasVipWaiting([P(1), P(2), P(3), Vip]);
        var removals = slots.OnRoundEnd([Playing(P(1)), Playing(P(2)), Playing(P(3)), Watching(Vip)], Vacancy);

        Assert.False(onConnect);
        Assert.True(waiting);
        Assert.Equal([new SlotRemoval(P(3), ReservedSlots.RemovedMessage(Vacancy))], removals);
    }

    [Fact]
    public void A_mensagem_combinada_indica_o_outro_servidor_quando_ha_vaga()
    {
        Assert.Equal(
            "Vaga liberada para um VIP. Há vaga em: " + Vacancy + ". Com o VIP, sua vaga é garantida.",
            ReservedSlots.RemovedMessage(Vacancy));
        Assert.Equal(
            "Vaga liberada para um VIP. Com o VIP, sua vaga é garantida.",
            ReservedSlots.RemovedMessage(null));
    }

    [Fact]
    public void Sai_primeiro_o_espectador_depois_o_AFK_depois_o_ultimo_que_entrou()
    {
        var slots = Retake(publicSlots: 4);
        foreach (var n in new[] { 1, 2, 3, 4 })
        {
            Join(slots, P(n));
        }
        Join(slots, Vip, isVip: true, humans: 5);
        // P(1) parado (AFK); os outros se mexendo.
        slots.OnSpawn(P(1));
        for (var i = 0; i <= 40; i++)
        {
            slots.RecordPose(P(1), new PlayerPose(0, 0, 0, 0, 0));
            slots.RecordPose(P(2), new PlayerPose(i, 0, 0, 0, 0));
            _time.Advance(TimeSpan.FromSeconds(1));
        }

        var first = slots.OnRoundEnd([Playing(P(1)), Watching(P(2)), Playing(P(3)), Playing(P(4)), Watching(Vip)], null);
        slots.OnLeave(P(2));
        Join(slots, Vip + 1, isVip: true, humans: 5);
        var second = slots.OnRoundEnd([Playing(P(1)), Playing(P(3)), Playing(P(4)), Playing(Vip), Watching(Vip + 1)], null);
        slots.OnLeave(P(1));
        Join(slots, Vip + 2, isVip: true, humans: 5);
        var third = slots.OnRoundEnd([Playing(P(3)), Playing(P(4)), Playing(Vip), Playing(Vip + 1), Watching(Vip + 2)], null);

        Assert.Equal([P(2)], first.Select(r => r.SteamId));
        Assert.Equal([P(1)], second.Select(r => r.SteamId));
        Assert.Equal([P(4)], third.Select(r => r.SteamId));
    }

    [Fact]
    public void Nunca_tira_um_VIP_e_espera_o_proximo_round_se_so_ha_VIPs()
    {
        var slots = Retake(publicSlots: 1);
        Join(slots, Vip, isVip: true);
        Join(slots, Vip + 1, isVip: true, humans: 2);

        Assert.Empty(slots.OnRoundEnd([Playing(Vip), Watching(Vip + 1)], null));
    }

    [Fact]
    public void Quem_saiu_fica_protegido_por_30_minutos()
    {
        var slots = Retake(publicSlots: 2);
        Join(slots, P(1));
        Join(slots, P(2));
        Join(slots, Vip, isVip: true, humans: 3);
        var removed = slots.OnRoundEnd([Playing(P(1)), Playing(P(2)), Watching(Vip)], null);
        slots.OnLeave(P(2));
        slots.OnLeave(Vip);

        // P(2) volta (havia vaga) e é o último a entrar; outro VIP chega.
        Join(slots, P(2), humans: 2);
        Join(slots, Vip + 1, isVip: true, humans: 3);
        var protectedRound = slots.OnRoundEnd([Playing(P(1)), Playing(P(2)), Watching(Vip + 1)], null);
        slots.OnLeave(P(1));
        _time.Advance(ReservedSlots.Protection);
        Join(slots, Vip + 2, isVip: true, humans: 3);
        var afterProtection = slots.OnRoundEnd([Playing(P(2)), Playing(Vip + 1), Watching(Vip + 2)], null);

        Assert.Equal([P(2)], removed.Select(r => r.SteamId));
        Assert.Equal([P(1)], protectedRound.Select(r => r.SteamId));
        Assert.Equal([P(2)], afterProtection.Select(r => r.SteamId));
    }

    [Fact]
    public void Ninguem_disponivel_para_sair_porque_todos_estao_protegidos_o_VIP_espera()
    {
        var slots = Retake(publicSlots: 1);
        Join(slots, P(1));
        Join(slots, Vip, isVip: true, humans: 2);
        slots.OnRoundEnd([Playing(P(1)), Watching(Vip)], null);
        slots.OnLeave(P(1));
        slots.OnLeave(Vip);
        Join(slots, P(1));
        Join(slots, Vip + 1, isVip: true, humans: 2);

        Assert.Empty(slots.OnRoundEnd([Playing(P(1)), Watching(Vip + 1)], null));
    }

    [Fact]
    public void Quem_ja_esta_saindo_nao_conta_de_novo_ate_o_disconnect()
    {
        var slots = Retake(publicSlots: 2);
        Join(slots, P(1));
        Join(slots, P(2));
        Join(slots, Vip, isVip: true, humans: 3);
        var players = new[] { Playing(P(1)), Playing(P(2)), Watching(Vip) };

        var first = slots.OnRoundEnd(players, null);
        var second = slots.OnRoundEnd(players, null);

        Assert.Single(first);
        Assert.Empty(second);
    }

    [Fact]
    public void Sem_VIP_confirmado_pela_API_ninguem_sai_falha_aberta()
    {
        var slots = Retake(publicSlots: 1);
        Join(slots, P(1));
        slots.OnJoin(P(2)); // a API não respondeu: não sabemos se é VIP.

        Assert.False(slots.HasVipWaiting([P(1), P(2)]));
        Assert.Empty(slots.OnRoundEnd([Playing(P(1)), Watching(P(2))], null));
    }

    [Fact]
    public void Ha_VIP_esperando_quando_lotado_com_VIP_presente()
    {
        var slots = Retake(publicSlots: 1);
        Join(slots, P(1));
        Join(slots, Vip, isVip: true, humans: 2);

        Assert.True(slots.HasVipWaiting([P(1), Vip]));
        Assert.False(slots.HasVipWaiting([Vip]));
    }

    [Fact]
    public void Desligado_nunca_tira_ninguem()
    {
        var slots = new ReservedSlots(ReservedSlotsMode.Off, 1, _time);
        Join(slots, P(1));
        slots.OnJoin(P(2));

        Assert.False(slots.OnConnectResult(P(2), isVip: false, humans: 2));
        Assert.Empty(slots.OnRoundEnd([Playing(P(1)), Watching(P(2))], null));
    }

    [Fact]
    public void Reaparecer_nao_conta_como_movimento_e_o_AFK_acumula_entre_rounds()
    {
        var slots = Retake(publicSlots: 2);
        Join(slots, P(1));
        Join(slots, P(2));
        Join(slots, Vip, isVip: true, humans: 3);
        // P(1) fica 20 s parado em cada um de dois rounds, em spawns diferentes.
        foreach (var spawn in new[] { 0, 500 })
        {
            slots.OnSpawn(P(1));
            for (var i = 0; i <= 20; i++)
            {
                slots.RecordPose(P(1), new PlayerPose(spawn, 0, 0, 0, 0));
                _time.Advance(TimeSpan.FromSeconds(1));
            }
        }

        var removals = slots.OnRoundEnd([Playing(P(1)), Playing(P(2)), Watching(Vip)], null);

        Assert.Equal([P(1)], removals.Select(r => r.SteamId));
    }

    [Fact]
    public void Olhar_em_volta_conta_como_atividade()
    {
        var slots = Retake(publicSlots: 2);
        Join(slots, P(1));
        Join(slots, P(2));
        Join(slots, Vip, isVip: true, humans: 3);
        slots.OnSpawn(P(1));
        for (var i = 0; i <= 40; i++)
        {
            slots.RecordPose(P(1), new PlayerPose(0, 0, 0, 0, i));
            _time.Advance(TimeSpan.FromSeconds(1));
        }

        var removals = slots.OnRoundEnd([Playing(P(1)), Playing(P(2)), Watching(Vip)], null);

        Assert.Equal([P(2)], removals.Select(r => r.SteamId));
    }
}
