namespace Carmine.Core;

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
