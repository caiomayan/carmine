using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>
/// <c>!rank</c> e <c>!stats</c> (S16): a API devolve a linha pronta, em português, com as mesmas regras
/// do Ranking da S12; o plugin só imprime, para quem pediu. Com a API fora, uma linha de aviso.
/// </summary>
public sealed class GameStatsLines(ICarmineApiClient api)
{
    public const string UnavailableMessage = "Não deu para consultar agora. Veja em stcarmine.com/ranking";

    /// <summary>Nunca lança por falha da API. Roda fora da thread do jogo.</summary>
    public Task<string> RankAsync(ulong steamId, CancellationToken cancellationToken) =>
        LineAsync(id => api.GetPlayerRankLineAsync(id, cancellationToken), steamId);

    /// <summary>Nunca lança por falha da API. Roda fora da thread do jogo.</summary>
    public Task<string> StatsAsync(ulong steamId, CancellationToken cancellationToken) =>
        LineAsync(id => api.GetPlayerStatsLineAsync(id, cancellationToken), steamId);

    private static async Task<string> LineAsync(Func<string, Task<PlayerGameLine>> fetch, ulong steamId)
    {
        try
        {
            var line = await fetch(steamId.ToString(CultureInfo.InvariantCulture)).ConfigureAwait(false);
            return line.Message;
        }
        catch (Exception error) when (error is ApiException or HttpRequestException or TaskCanceledException)
        {
            return UnavailableMessage;
        }
    }
}
