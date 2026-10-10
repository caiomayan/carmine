using Microsoft.Extensions.Logging;

namespace Carmine.Hello;

internal static partial class Log
{
    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Hello: {Summary}")]
    public static partial void ApiHealthy(ILogger logger, string summary);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Carmine.Hello: {Summary}")]
    public static partial void ApiUnhealthy(ILogger logger, string summary);
}
