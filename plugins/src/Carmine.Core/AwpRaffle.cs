using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>
/// O sorteio da AWP do Retake como Preferência de jogo (ADR 0028). A escolha mora na Conta, na API, e vale
/// em todo Retake; o RetakesAllocator só guarda uma cópia local. O Core aplica o estado da API no alocador
/// no primeiro spawn de cada conexão, e é dono do <c>!awp</c>: a API inverte a preferência e o Core aplica o
/// resultado com comandos que ligam ou desligam de forma explícita (o <c>css_awp</c> do alocador alterna).
/// Segura para uso por várias threads.
/// </summary>
public sealed class AwpRaffle(ICarmineApiClient api)
{
    /// <summary>
    /// Liga a AWP no alocador (<c>css_gun</c> define a preferência; o <c>ct</c> deixa o comando valer com o
    /// jogador ainda na escolha de time, e a preferência de AWP vale para os dois times).
    /// </summary>
    public const string JoinCommand = "css_gun awp ct";

    /// <summary>Desliga a AWP no alocador (<c>remove: true</c> zera a preferência de sniper).</summary>
    public const string LeaveCommand = "css_removegun awp ct";

    public const string EnteredMessage = "Você entrou no sorteio da AWP. Para sair, digite !awp.";

    public const string LeftMessage = "Você saiu do sorteio da AWP. Para voltar, digite !awp.";

    public const string UnavailableMessage = "Não deu para mudar a AWP agora. Tente de novo em instantes.";

    private readonly Lock _lock = new();
    private readonly Dictionary<ulong, bool> _pending = [];

    /// <summary>O comando do alocador que deixa a preferência no estado pedido.</summary>
    public static string CommandFor(bool enabled) => enabled ? JoinCommand : LeaveCommand;

    /// <summary>O aviso a mostrar depois de o jogador alternar com o <c>!awp</c>.</summary>
    public static string MessageFor(bool enabled) => enabled ? EnteredMessage : LeftMessage;

    /// <summary>
    /// A API respondeu ao connect com o estado da Conta. Devolve o estado a aplicar agora se o jogador já
    /// está vivo num time; senão o guarda para o spawn (no connect o alocador ainda não conhece o jogador).
    /// </summary>
    public bool? OnConnectResult(ulong steamId, bool enabled, bool isAlive)
    {
        lock (_lock)
        {
            if (isAlive)
            {
                _pending.Remove(steamId);
                return enabled;
            }
            _pending[steamId] = enabled;
            return null;
        }
    }

    /// <summary>O jogador nasceu: o estado guardado, uma única vez; <c>null</c> se não há.</summary>
    public bool? TakeOnSpawn(ulong steamId)
    {
        lock (_lock)
        {
            return _pending.Remove(steamId, out var enabled) ? enabled : null;
        }
    }

    public void OnDisconnect(ulong steamId)
    {
        lock (_lock)
        {
            _pending.Remove(steamId);
        }
    }

    /// <summary>
    /// O <c>!awp</c>: a API inverte a preferência da Conta e devolve o novo valor. <c>null</c> se a API não
    /// respondeu (nada mudou, e o jogador é avisado). Roda fora da thread do jogo.
    /// </summary>
    public async Task<bool?> ToggleAsync(ulong steamId, CancellationToken cancellationToken)
    {
        try
        {
            var value = await api.TogglePlayerGamePreferenceAsync(
                steamId.ToString(CultureInfo.InvariantCulture),
                GamePreferenceKey.Awp_raffle,
                cancellationToken).ConfigureAwait(false);
            return value.Enabled;
        }
        catch (Exception error) when (error is ApiException or HttpRequestException
            || (error is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            return null;
        }
    }
}
