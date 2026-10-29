using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>
/// A AWP do Retake é para todos (S02), mas o RetakesAllocator só sorteia quem tem a preferência de
/// AWP, e ela nasce vazia. Uma vez por Conta (a API manda <c>ApplyAwpDefault</c> até a marca), no
/// primeiro spawn num Retake, o plugin liga a preferência pelo comando do próprio alocador.
/// </summary>
public sealed class AwpDefault(ICarmineApiClient api)
{
    /// <summary>
    /// <c>css_gun awp</c> só liga a preferência (<c>remove: false</c> no alocador). O <c>css_awp</c> alterna: tiraria
    /// a AWP de quem já a tinha ligado sozinho, e o plugin não tem como ler a preferência do alocador.
    /// </summary>
    public const string Command = "css_gun awp";

    /// <summary>
    /// Guarda a marca na API. Nunca lança por falha dela: sem a marca, o próximo connect repete o
    /// comando, que não muda nada em quem já está na fila. Roda fora da thread do jogo.
    /// </summary>
    public async Task<bool> MarkAppliedAsync(ulong steamId, CancellationToken cancellationToken)
    {
        try
        {
            await api.MarkPlayerAwpDefaultAppliedAsync(
                steamId.ToString(CultureInfo.InvariantCulture), cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (Exception error) when (error is ApiException or HttpRequestException
            || (error is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            return false;
        }
    }
}
