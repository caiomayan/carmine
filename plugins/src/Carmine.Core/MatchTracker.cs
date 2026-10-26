using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>O placar de times que vai no batimento: o round em andamento e os rounds vencidos por lado.</summary>
public sealed record MatchSnapshot(int Round, int CtScore, int TScore, bool Warmup);

/// <summary>O placar depois de um round que contou: o número dele no mapa e os rounds vencidos por lado.</summary>
public sealed record RoundResult(int RoundNumber, int CtScore, int TScore);

/// <summary>O que o jogo diz do placar (<c>TotalRoundsPlayed</c> e a pontuação dos dois times).</summary>
public sealed record GameScore(int RoundsPlayed, int CtScore, int TScore);

public enum ReconcileOutcome
{
    /// <summary>O jogo concorda com a contagem do plugin.</summary>
    Agree,

    /// <summary>Não deu para ler o jogo (ou ainda é aquecimento): nada a conferir.</summary>
    Unavailable,

    /// <summary>O jogo reiniciou a partida (<c>mp_restartgame</c>, fim do aquecimento): a contagem zerou junto.</summary>
    Restarted,

    /// <summary>
    /// O jogo e o plugin discordam (rounds sem humanos nos dois lados, que o plugin não conta, ou
    /// um placar reescrito por outro plugin). A contagem do plugin segue valendo; vale um aviso.
    /// </summary>
    Diverged,

    /// <summary>A divergência já foi avisada nesta partida: não avisa de novo.</summary>
    StillDiverged,
}

/// <summary>
/// O placar de times do Retake (S12b), contado pelo próprio plugin a partir do <c>round_end</c>
/// em vez de lido do jogo. O cs2-retakes nunca escreve o placar dos times (nem
/// <c>TotalRoundsPlayed</c>), mas termina rounds por conta própria quando falta gente
/// (<c>TerminateRound(TerroristsWin)</c> num servidor sem humanos, <c>mp_restartgame</c> ao esvaziar),
/// e esses rounds sintéticos inflariam o placar do jogo. Por isso só conta o round que teve humanos
/// nos dois lados e não era aquecimento.
///
/// Zera quando o mapa muda, quando a partida recomeça (<c>begin_new_match</c>) e quando o jogo
/// diz que recomeçou (<see cref="Reconcile"/>). O placar do jogo é a fonte secundária: só confere
/// e avisa se divergir. Só roda na thread do jogo.
/// </summary>
public sealed class MatchTracker
{
    private int _played;
    private int _ct;
    private int _t;
    private bool _divergenceReported;

    public int RoundsPlayed => _played;

    public int CtScore => _ct;

    public int TScore => _t;

    /// <summary>Começo de mapa ou de partida: tudo zero.</summary>
    public void Reset()
    {
        _played = 0;
        _ct = 0;
        _t = 0;
        _divergenceReported = false;
    }

    /// <summary>
    /// O plugin foi carregado com a partida em andamento (hot reload): parte do que o jogo já
    /// contou, em vez de zero.
    /// </summary>
    public void Adopt(GameScore game)
    {
        _played = Math.Max(game.RoundsPlayed, 0);
        _ct = Math.Max(game.CtScore, 0);
        _t = Math.Max(game.TScore, 0);
    }

    /// <summary>
    /// Um round acabou. Devolve o placar depois dele, ou nulo se o round não conta (aquecimento ou
    /// sem humanos nos dois lados). Empate (<see cref="RoundWinner.None"/>) conta como round jogado,
    /// sem ponto para ninguém.
    /// </summary>
    public RoundResult? RoundEnded(RoundWinner winner, bool warmup, bool humansOnBothSides)
    {
        if (warmup || !humansOnBothSides)
        {
            return null;
        }
        _played++;
        switch (winner)
        {
            case RoundWinner.Ct:
                _ct++;
                break;
            case RoundWinner.T:
                _t++;
                break;
        }
        return new RoundResult(_played, _ct, _t);
    }

    /// <summary>O placar do batimento: o round em andamento é o seguinte ao último que contou.</summary>
    public MatchSnapshot Snapshot(bool warmup) => new(_played + 1, _ct, _t, warmup);

    /// <summary>
    /// Confere com o jogo no começo de um round de verdade (fora do aquecimento). Zero rounds
    /// jogados no jogo com a contagem do plugin adiante é uma partida reiniciada: zera. Qualquer
    /// outra diferença fica com a contagem do plugin, e só avisa uma vez por partida.
    /// </summary>
    public ReconcileOutcome Reconcile(GameScore? game, bool warmup)
    {
        if (game is null || warmup)
        {
            return ReconcileOutcome.Unavailable;
        }
        if (game.RoundsPlayed == 0 && _played > 0)
        {
            Reset();
            return ReconcileOutcome.Restarted;
        }
        if (game.RoundsPlayed == _played && game.CtScore == _ct && game.TScore == _t)
        {
            return ReconcileOutcome.Agree;
        }
        if (_divergenceReported)
        {
            return ReconcileOutcome.StillDiverged;
        }
        _divergenceReported = true;
        return ReconcileOutcome.Diverged;
    }
}
