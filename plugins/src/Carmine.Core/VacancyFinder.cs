using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>
/// O outro Servidor Carmine com vaga para a mensagem da Vaga reservada ("Há vaga em: ..."), pela
/// lista ao vivo da API (S06). Prefere o mesmo Modo e, entre eles, o mais vazio. Este servidor
/// nunca aparece: quando alguém sai pela Vaga reservada, ele está lotado. Nunca lança: com a API
/// fora, devolve nulo e a mensagem sai sem a indicação.
/// </summary>
public sealed class VacancyFinder(ICarmineApiClient api)
{
    public async Task<string?> FindAsync(GameMode mode, CancellationToken cancellationToken)
    {
        LiveServerList list;
        try
        {
            list = await api.ListLiveServersAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception error) when (error is ApiException or HttpRequestException
            || (error is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            return null;
        }
        var best = list.Servers
            .Where(s => s.State == LiveServerState.Online && s.Players < s.MaxPlayers)
            .OrderByDescending(s => s.Mode == mode)
            .ThenByDescending(s => s.MaxPlayers - s.Players)
            .FirstOrDefault();
        return best is null ? null : Describe(best);
    }

    /// <summary>"Retake · Mirage (SP·3), connect 10.0.0.1:27017": o jogador copia o comando no console.</summary>
    private static string Describe(LiveServer server)
    {
        var name = server.ShowcaseName ?? server.Name;
        var code = string.IsNullOrWhiteSpace(server.Code) ? "" : $" ({server.Code})";
        return $"{name}{code}, connect {server.Address}";
    }
}
