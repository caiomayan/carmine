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
}
