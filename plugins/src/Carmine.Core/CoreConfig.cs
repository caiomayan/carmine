using System.Text.Json.Serialization;
using CounterStrikeSharp.API.Core;

namespace Carmine.Core;

/// <summary>
/// Gerado pelo CounterStrikeSharp em
/// addons/counterstrikesharp/configs/plugins/Carmine.Core/Carmine.Core.json no primeiro carregamento.
/// </summary>
public sealed class CoreConfig : BasePluginConfig
{
    [JsonPropertyName("ApiBaseUrl")]
    public string ApiBaseUrl { get; set; } = "http://localhost:3333";

    /// <summary>
    /// Chave deste Servidor Carmine na API (ADR 0005), gerada por
    /// <c>pnpm --filter @carmine/api servers create</c>. Nunca versionar o valor real.
    /// </summary>
    [JsonPropertyName("ApiKey")]
    public string ApiKey { get; set; } = "";

    [JsonPropertyName("TimeoutSeconds")]
    public int TimeoutSeconds { get; set; } = 5;

    /// <summary>De quanto em quanto tempo os connects guardados com a API fora são reenviados.</summary>
    [JsonPropertyName("RetryIntervalSeconds")]
    public int RetryIntervalSeconds { get; set; } = 15;

    /// <summary>De quanto em quanto tempo o batimento vai à API (S06); sem batimento por 45 s, o servidor fica offline.</summary>
    [JsonPropertyName("HeartbeatIntervalSeconds")]
    public int HeartbeatIntervalSeconds { get; set; } = 10;

    /// <summary>
    /// Vagas públicas mostradas no site (o servidor fica lotado com essa quantidade de jogadores).
    /// 0 usa o maxplayers do servidor. No Retake, 9 (as do cs2-retakes): o maxplayers tem a folga
    /// da Vaga reservada.
    /// </summary>
    [JsonPropertyName("PublicSlots")]
    public int PublicSlots { get; set; }
}
