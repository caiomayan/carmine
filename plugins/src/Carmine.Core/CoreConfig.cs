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
}
