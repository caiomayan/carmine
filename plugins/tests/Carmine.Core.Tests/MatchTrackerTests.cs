using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class MatchTrackerTests
{
    [Fact]
    public void Conta_os_rounds_vencidos_por_lado_e_devolve_o_placar_depois_do_round()
    {
        var match = new MatchTracker();

        var first = match.RoundEnded(RoundWinner.Ct, warmup: false, humansOnBothSides: true);
        var second = match.RoundEnded(RoundWinner.T, false, true);
        var third = match.RoundEnded(RoundWinner.Ct, false, true);

        Assert.Equal(new RoundResult(1, 1, 0), first);
        Assert.Equal(new RoundResult(2, 1, 1), second);
        Assert.Equal(new RoundResult(3, 2, 1), third);
        Assert.Equal(3, match.RoundsPlayed);
    }

    [Fact]
    public void Aquecimento_e_round_sem_humanos_nos_dois_lados_nao_contam()
    {
        var match = new MatchTracker();

        Assert.Null(match.RoundEnded(RoundWinner.Ct, warmup: true, humansOnBothSides: true));
        // O cs2-retakes termina rounds por conta própria quando falta gente: não são rounds de verdade.
        Assert.Null(match.RoundEnded(RoundWinner.T, warmup: false, humansOnBothSides: false));

        Assert.Equal(0, match.RoundsPlayed);
        Assert.Equal(new MatchSnapshot(1, 0, 0, false), match.Snapshot(warmup: false));
    }

    [Fact]
    public void Empate_conta_como_round_jogado_sem_ponto_para_ninguem()
    {
        var match = new MatchTracker();
        match.RoundEnded(RoundWinner.Ct, false, true);

        var draw = match.RoundEnded(RoundWinner.None, false, true);

        Assert.Equal(new RoundResult(2, 1, 0), draw);
    }

    [Fact]
    public void O_round_em_andamento_e_o_seguinte_ao_ultimo_que_contou_e_o_aquecimento_vai_marcado()
    {
        var match = new MatchTracker();
        match.RoundEnded(RoundWinner.T, false, true);

        Assert.Equal(new MatchSnapshot(2, 0, 1, false), match.Snapshot(warmup: false));
        Assert.Equal(new MatchSnapshot(2, 0, 1, true), match.Snapshot(warmup: true));
    }

    [Fact]
    public void Mapa_novo_ou_partida_reiniciada_zera_tudo()
    {
        var match = new MatchTracker();
        match.RoundEnded(RoundWinner.Ct, false, true);
        match.RoundEnded(RoundWinner.T, false, true);

        match.Reset();

        Assert.Equal(new MatchSnapshot(1, 0, 0, false), match.Snapshot(false));
        Assert.Equal(new RoundResult(1, 0, 1), match.RoundEnded(RoundWinner.T, false, true));
    }

    [Fact]
    public void Plugin_carregado_com_a_partida_andando_parte_do_que_o_jogo_ja_contou()
    {
        var match = new MatchTracker();

        match.Adopt(new GameScore(RoundsPlayed: 11, CtScore: 7, TScore: 4));

        Assert.Equal(new MatchSnapshot(12, 7, 4, false), match.Snapshot(false));
        Assert.Equal(new RoundResult(12, 8, 4), match.RoundEnded(RoundWinner.Ct, false, true));
    }

    [Fact]
    public void Adotar_nao_aceita_numero_negativo()
    {
        var match = new MatchTracker();

        match.Adopt(new GameScore(-1, -3, -2));

        Assert.Equal(new MatchSnapshot(1, 0, 0, false), match.Snapshot(false));
    }

    [Fact]
    public void Conferir_com_o_jogo_concorda_quando_os_numeros_batem()
    {
        var match = new MatchTracker();
        match.RoundEnded(RoundWinner.Ct, false, true);
        match.RoundEnded(RoundWinner.T, false, true);

        Assert.Equal(ReconcileOutcome.Agree, match.Reconcile(new GameScore(2, 1, 1), warmup: false));
    }

    [Fact]
    public void Jogo_com_zero_rounds_e_plugin_adiante_e_partida_reiniciada()
    {
        var match = new MatchTracker();
        match.RoundEnded(RoundWinner.Ct, false, true);

        var outcome = match.Reconcile(new GameScore(0, 0, 0), warmup: false);

        Assert.Equal(ReconcileOutcome.Restarted, outcome);
        Assert.Equal(0, match.RoundsPlayed);
        Assert.Equal(0, match.CtScore);
    }

    [Fact]
    public void Durante_o_aquecimento_ou_sem_leitura_do_jogo_nao_ha_o_que_conferir()
    {
        var match = new MatchTracker();
        match.RoundEnded(RoundWinner.Ct, false, true);

        Assert.Equal(ReconcileOutcome.Unavailable, match.Reconcile(new GameScore(0, 0, 0), warmup: true));
        Assert.Equal(ReconcileOutcome.Unavailable, match.Reconcile(null, warmup: false));
        Assert.Equal(1, match.RoundsPlayed);
    }

    [Fact]
    public void Divergencia_avisa_uma_vez_por_partida_e_a_contagem_do_plugin_continua_valendo()
    {
        var match = new MatchTracker();
        match.RoundEnded(RoundWinner.Ct, false, true);
        match.RoundEnded(RoundWinner.Ct, false, true);
        // O jogo contou um round a mais (um round sintético sem humanos).
        var game = new GameScore(3, 2, 1);

        Assert.Equal(ReconcileOutcome.Diverged, match.Reconcile(game, false));
        Assert.Equal(ReconcileOutcome.StillDiverged, match.Reconcile(game, false));
        Assert.Equal(new MatchSnapshot(3, 2, 0, false), match.Snapshot(false));

        match.Reset();
        match.RoundEnded(RoundWinner.T, false, true);
        Assert.Equal(ReconcileOutcome.Diverged, match.Reconcile(new GameScore(2, 0, 2), false));
    }
}
