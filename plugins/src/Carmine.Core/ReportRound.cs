namespace Carmine.Core;

/// <summary>
/// O Mapa jogado que a Denúncia leva (S17), para a fila agrupar por caso pelo mapa de verdade e não por servidor e
/// nome de mapa. É o do <see cref="MatchTracker"/> no momento do <c>!report</c>, em qualquer Modo e no aquecimento
/// também (ele já tem um); sem o rastreador (eventos desligados), nada.
/// </summary>
public static class ReportMapPlay
{
    public static Guid? Current(MatchTracker? match) => match?.MapPlayId;
}

/// <summary>
/// O round que a Denúncia leva. O contrato promete o round <b>em andamento</b>, mas o jogo só conta os
/// rounds terminados (<c>TotalRoundsPlayed</c>): no round 8 ele vale 7.
/// </summary>
public static class ReportRound
{
    /// <summary>
    /// O número do round em andamento, ou <c>null</c> quando o plugin não sabe (sem as regras do jogo)
    /// ou não há round valendo (aquecimento).
    /// </summary>
    public static int? InProgress(int? roundsFinished, bool warmup) =>
        roundsFinished is { } finished && !warmup ? finished + 1 : null;
}
