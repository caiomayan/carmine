using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>O estado do servidor agora: mapa, jogadores humanos conectados e vagas públicas.</summary>
public sealed record ServerSnapshot(string Map, IReadOnlyList<ulong> Players, int MaxPlayers);

public enum HeartbeatReportKind
{
    /// <summary>A API recebeu, como da última vez.</summary>
    Sent,

    /// <summary>A API parou de receber agora: vale um aviso no log.</summary>
    WentDown,

    /// <summary>A API continua sem receber: nada a avisar de novo.</summary>
    StillDown,

    /// <summary>A API voltou a receber: vale um aviso no log.</summary>
    CameBack,
}

/// <summary>
/// O que aconteceu com um batimento, para o plugin logar só as transições. Quando a API recebeu,
/// <see cref="Result"/> traz o que aplicar no jogo (hostname e Punições, S07).
/// </summary>
public sealed record HeartbeatReport(HeartbeatReportKind Kind, string? Reason = null, ServerHeartbeatResult? Result = null)
{
    public static readonly HeartbeatReport StillDown = new(HeartbeatReportKind.StillDown);
}

/// <summary>
/// Manda o batimento do servidor à API (S06): o estado inteiro, não um delta, então um batimento
/// perdido não precisa de fila; o próximo já leva o estado atual. Com a API fora, a home mostra o
/// servidor offline depois de 45 s, e o jogo segue normal. Nunca lança por falha da API; roda
/// fora da thread do jogo; envios simultâneos (o timer e o batimento logo depois de um connect)
/// saem um de cada vez.
/// </summary>
[SuppressMessage("Reliability", "CA1001", Justification = "O SemaphoreSlim só segura recurso nativo se o AvailableWaitHandle for usado, e não é.")]
public sealed class HeartbeatReporter(ICarmineApiClient api)
{
    private readonly SemaphoreSlim _sending = new(1, 1);
    private bool _down;

    public async Task<HeartbeatReport> SendAsync(ServerSnapshot snapshot, CancellationToken cancellationToken)
    {
        await _sending.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            return await SendOneAsync(snapshot, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _sending.Release();
        }
    }

    private async Task<HeartbeatReport> SendOneAsync(ServerSnapshot snapshot, CancellationToken cancellationToken)
    {
        ServerHeartbeatResult result;
        try
        {
            result = await api.SendHeartbeatAsync(
                new ServerHeartbeat
                {
                    Map = snapshot.Map,
                    Players = [.. snapshot.Players.Select(id => id.ToString(CultureInfo.InvariantCulture))],
                    MaxPlayers = snapshot.MaxPlayers,
                },
                cancellationToken).ConfigureAwait(false);
        }
        catch (Exception error) when (IsApiFailure(error, cancellationToken))
        {
            if (_down)
            {
                return HeartbeatReport.StillDown;
            }
            _down = true;
            return new HeartbeatReport(HeartbeatReportKind.WentDown, Describe(error));
        }
        if (_down)
        {
            _down = false;
            return new HeartbeatReport(HeartbeatReportKind.CameBack, Result: result);
        }
        return new HeartbeatReport(HeartbeatReportKind.Sent, Result: result);
    }

    /// <summary>Cancelamento pedido por nós (plugin descarregando) não conta.</summary>
    private static bool IsApiFailure(Exception error, CancellationToken cancellationToken) => error switch
    {
        ApiException or HttpRequestException => true,
        TaskCanceledException => !cancellationToken.IsCancellationRequested,
        _ => false,
    };

    private static string Describe(Exception error) => error switch
    {
        ApiException api => $"API respondeu HTTP {api.StatusCode}",
        TaskCanceledException => "API não respondeu a tempo",
        _ => $"API inacessível: {error.Message}",
    };
}
