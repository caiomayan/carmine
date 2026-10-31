using Carmine.Api.Client;
using Microsoft.Extensions.Logging;

namespace Carmine.Core;

internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Core: {Summary}")]
    public static partial void ApiHealthy(ILogger logger, string summary);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Carmine.Core: {Summary}")]
    public static partial void ApiUnhealthy(ILogger logger, string summary);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Carmine.Core: {SteamId} conectou como \"{DisplayName}\" (#{PublicId}, primeiro connect: {IsFirstConnect})")]
    public static partial void ConnectSynced(ILogger logger, ulong steamId, string displayName, long publicId, bool isFirstConnect);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Carmine.Core: connect de {SteamId} guardado para reenvio ({Reason}); {Pending} na fila")]
    public static partial void ConnectQueued(ILogger logger, ulong steamId, string reason, int pending);

    [LoggerMessage(Level = LogLevel.Error, Message = "Carmine.Core: connect de {SteamId} recusado pela API ({Reason})")]
    public static partial void ConnectRejected(ILogger logger, ulong steamId, string reason);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Carmine.Core: API de volta; {Count} connect(s) guardado(s) reenviado(s), {Pending} na fila")]
    public static partial void PendingReplayed(ILogger logger, int count, int pending);

    [LoggerMessage(Level = LogLevel.Error, Message = "Carmine.Core: connect guardado recusado pela API ({Detail})")]
    public static partial void PendingRejected(ILogger logger, string detail);

    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Core: {Count} connect(s) guardado(s) de antes do restart")]
    public static partial void PendingLoaded(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Carmine.Core: batimento não chegou à API ({Reason}); o site mostra o servidor offline em 45 s, o jogo segue normal")]
    public static partial void HeartbeatDown(ILogger logger, string reason);

    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Core: batimento de volta; o site mostra o servidor ao vivo")]
    public static partial void HeartbeatBack(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Core: {SteamId} sai do servidor por Punição (ban: {Ban})")]
    public static partial void SanctionKick(ILogger logger, ulong steamId, bool ban);

    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Core: hostname agora é \"{Hostname}\"")]
    public static partial void HostnameApplied(ILogger logger, string hostname);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Carmine.Core: eventos do jogo não chegaram à API ({Reason}); ficam na fila e são reenviados, o jogo segue normal")]
    public static partial void EventsDown(ILogger logger, string reason);

    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Core: eventos do jogo de volta à API; a fila foi enviada")]
    public static partial void EventsBack(ILogger logger);

    [LoggerMessage(Level = LogLevel.Error, Message = "Carmine.Core: {Detail}; descartados")]
    public static partial void EventsRejected(ILogger logger, string detail);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Carmine.Core: {Count} evento(s) do jogo descartado(s) (fila cheia ou lote recusado)")]
    public static partial void EventsDropped(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Carmine.Core: {Count} evento(s) do jogo não saíram antes de o plugin descarregar")]
    public static partial void EventsLeftBehind(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Core: a partida recomeçou; a contagem de rounds do placar voltou a zero")]
    public static partial void MatchRestarted(ILogger logger);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Carmine.Core: o placar do jogo diverge da contagem do plugin (plugin: {Rounds} rounds, CT {Ct} x T {T}; jogo: {GameRounds} rounds, CT {GameCt} x T {GameT}); vale a contagem do plugin")]
    public static partial void MatchDiverged(ILogger logger, int rounds, int ct, int t, int gameRounds, int gameCt, int gameT);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Carmine.Core: wall-logos.json inválido, sem logo nas paredes: {Error}")]
    public static partial void WallLogosInvalid(ILogger logger, string error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Carmine.Core: não consegui criar o custom_hud_layout; o card de boas-vindas não aparece")]
    public static partial void CardLayoutFailed(ILogger logger);

    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Core: Denúncia de {Reporter} contra {Target} ({Reason}); aceita: {Accepted}")]
    public static partial void ReportSent(ILogger logger, ulong reporter, ulong target, ReportReason reason, bool accepted);
}
