using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>
/// O que o plugin sabe do addon do Workshop (S19): o layout, o painel do card, a classe que o esconde e as
/// variáveis que o layout lê. Os valores precisam bater com <c>infra/cs2/addon/addon.contract.json</c>: um teste
/// confere os dois lados, então mudar o layout sem mudar o plugin (ou o contrário) quebra a CI.
/// </summary>
public static class AddonCard
{
    /// <summary>Caminho do layout dentro do addon (<c>custom_hud_layout</c> carrega por ele).</summary>
    public const string LayoutResource = "panorama/layout/custom_game/carmine_card.xml";

    /// <summary>Quanto tempo o card fica na tela por padrão, em segundos.</summary>
    public const float DefaultSeconds = 6f;

    /// <summary>O material do logo nas paredes, dentro do addon.</summary>
    public const string WallLogoMaterial = "materials/carmine/wall_logo.vmat";

    /// <summary>O painel do card; é nele que as variáveis de diálogo e a classe valem.</summary>
    public const string PanelId = "carmine_card";

    /// <summary>Com a classe o card fica fora da tela; sem ela, entra deslizando.</summary>
    public const string HiddenClass = "CarmineCardHidden";

    /// <summary>Com a classe a linha do card some (o CSS não esconde um <c>Label</c> sem texto sozinho).</summary>
    public const string RowHiddenClass = "CarmineRowHidden";

    public static readonly IReadOnlyList<string> Variables = ["name", "plan", "rank", "friends", "rating"];

    /// <summary>O painel de cada linha opcional do card, pela variável que ela mostra.</summary>
    public static readonly IReadOnlyDictionary<string, string> RowPanels = new Dictionary<string, string>
    {
        ["plan"] = "carmine_row_plan",
        ["rank"] = "carmine_row_rank",
        ["friends"] = "carmine_row_friends",
        ["rating"] = "carmine_row_rating",
    };

    /// <summary>Para cada linha opcional, se ela fica escondida: texto vazio não deixa buraco no card.</summary>
    public static IReadOnlyList<(string Panel, bool Hidden)> RowsFor(PlayerCard card) =>
    [
        (RowPanels["plan"], string.IsNullOrEmpty(card.Plan)),
        (RowPanels["rank"], string.IsNullOrEmpty(card.Rank)),
        (RowPanels["friends"], string.IsNullOrEmpty(card.Friends)),
        (RowPanels["rating"], string.IsNullOrEmpty(card.Rating)),
    ];

    /// <summary>As variáveis de diálogo do jogador, na ordem do contrato. Texto vazio deixa a linha sem nada.</summary>
    public static IReadOnlyList<(string Variable, string Value)> VariablesFor(PlayerCard card) =>
    [
        ("name", card.Name),
        ("plan", card.Plan),
        ("rank", card.Rank),
        ("friends", card.Friends),
        ("rating", card.Rating),
    ];

    /// <summary>
    /// O card quando a API não respondeu a tempo: só o nome, que o plugin já tem. Nunca inventa número
    /// (AGENTS.md, "sem dado inventado").
    /// </summary>
    public static PlayerCard OnlyName(string name) =>
        new() { Name = name, Plan = "", Rank = "", Friends = "", Rating = "" };
}

/// <summary>
/// O card de boas-vindas em Panorama (S19). No connect o jogador ainda está na escolha de time, então o card
/// espera o primeiro spawn da conexão (como a linha do connect); os textos vêm da API (ela decide o que dizer,
/// o plugin só os entrega ao addon). Segura para uso por várias threads.
/// </summary>
public sealed class WelcomeCard(ICarmineApiClient api)
{
    private readonly Lock _lock = new();
    private readonly HashSet<ulong> _pending = [];

    /// <summary>
    /// A API respondeu ao connect. <c>true</c>: mostre o card agora (o jogador já está vivo num time).
    /// Senão ele fica guardado para o spawn.
    /// </summary>
    public bool OnConnectResult(ulong steamId, bool isAlive)
    {
        lock (_lock)
        {
            if (isAlive)
            {
                _pending.Remove(steamId);
                return true;
            }
            _pending.Add(steamId);
            return false;
        }
    }

    /// <summary>O jogador nasceu: <c>true</c> uma única vez por conexão, se o card estava esperando.</summary>
    public bool TakeOnSpawn(ulong steamId)
    {
        lock (_lock)
        {
            return _pending.Remove(steamId);
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
    /// Os textos do card. <c>null</c> se a API não respondeu (o chamador mostra só o nome). Roda fora da
    /// thread do jogo.
    /// </summary>
    public async Task<PlayerCard?> FetchAsync(ulong steamId, CancellationToken cancellationToken)
    {
        try
        {
            return await api.GetPlayerCardAsync(
                steamId.ToString(CultureInfo.InvariantCulture), cancellationToken).ConfigureAwait(false);
        }
        catch (Exception error) when (error is ApiException or HttpRequestException
            || (error is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            return null;
        }
    }
}
