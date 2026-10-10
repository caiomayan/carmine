using System.Text.Json.Serialization;
using CounterStrikeSharp.API.Core;

namespace Carmine.Hello;

/// <summary>
/// Gerado pelo CounterStrikeSharp em
/// addons/counterstrikesharp/configs/plugins/Carmine.Hello/Carmine.Hello.json no primeiro carregamento.
/// </summary>
public sealed class HelloConfig : BasePluginConfig
{
    [JsonPropertyName("ApiBaseUrl")]
    public string ApiBaseUrl { get; set; } = "http://localhost:3333";

    /// <summary>Chave deste Servidor Carmine na API (ADR 0005). Nunca versionar o valor real.</summary>
    [JsonPropertyName("ApiKey")]
    public string ApiKey { get; set; } = "";

    [JsonPropertyName("TimeoutSeconds")]
    public int TimeoutSeconds { get; set; } = 5;
}
