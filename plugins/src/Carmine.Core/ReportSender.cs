using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>O que o jogador lê depois do <c>!report</c> e se a API aceitou a Denúncia.</summary>
public sealed record ReportOutcome(string Message, bool Accepted);

/// <summary>
/// Envia a Denúncia (S13) à API, que aplica os limites (1 por alvo a cada 10 minutos, 5 por hora) e
/// devolve a mensagem pronta para o chat, tanto na aceitação quanto na recusa. Antes de enviar,
/// esvazia a fila de eventos: o chat do momento viaja nela, e a API copia as últimas linhas para a
/// Denúncia na hora em que a recebe. Nunca lança por falha da API; roda fora da thread do jogo.
/// </summary>
public sealed class ReportSender(ICarmineApiClient api, EventReporter events)
{
    public const string UnavailableMessage = "Não deu para enviar a denúncia agora. Tente de novo em instantes.";

    public async Task<ReportOutcome> SendAsync(
        ulong reporter,
        ulong target,
        ReportReason reason,
        long? round,
        string? map,
        CancellationToken cancellationToken)
    {
        await events.FlushAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var result = await api.CreateReportAsync(
                new CreateReport
                {
                    ReporterSteamId = reporter.ToString(CultureInfo.InvariantCulture),
                    TargetSteamId = target.ToString(CultureInfo.InvariantCulture),
                    Reason = reason,
                    Round = round,
                    Map = map is { Length: > 64 } ? map[..64] : map,
                },
                cancellationToken).ConfigureAwait(false);
            return new ReportOutcome(result.Message, result.Accepted);
        }
        catch (Exception error) when (error is ApiException or HttpRequestException
            || (error is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            return new ReportOutcome(UnavailableMessage, Accepted: false);
        }
    }
}
