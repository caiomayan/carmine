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

    /// <summary>De quanto em quanto tempo os eventos do jogo (S12) vão à API; a fila também sai no fim do mapa e ao descarregar.</summary>
    [JsonPropertyName("EventFlushIntervalSeconds")]
    public int EventFlushIntervalSeconds { get; set; } = 5;

    /// <summary>Eventos que esperam na memória com a API fora; acima disso, os mais antigos são descartados.</summary>
    [JsonPropertyName("EventQueueLimit")]
    public int EventQueueLimit { get; set; } = EventReporter.DefaultMaxQueued;

    /// <summary>
    /// Vagas públicas mostradas no site (o servidor fica lotado com essa quantidade de jogadores).
    /// 0 usa o maxplayers do servidor. No Retake, 9 (as do cs2-retakes): o maxplayers tem a folga
    /// da Vaga reservada.
    /// </summary>
    [JsonPropertyName("PublicSlots")]
    public int PublicSlots { get; set; }

    /// <summary>
    /// Vaga reservada (S14): <c>"retake"</c> (com o VIP além das <see cref="PublicSlots"/>, um
    /// jogador sem VIP sai no fim do round), <c>"deathmatch"</c> (vagas extras só para VIP) ou
    /// vazio (desligada). Ligada, exige <see cref="PublicSlots"/> abaixo do maxplayers do servidor.
    /// </summary>
    [JsonPropertyName("ReservedSlots")]
    public string ReservedSlots { get; set; } = "";

    /// <summary>
    /// Addon do Workshop (S19): liga o card de boas-vindas e o logo nas paredes. O <c>prestart.sh</c> só o liga nos
    /// perfis abertos, com o item publicado e a chave de emergência (<c>CARMINE_ADDON_ENABLED</c>) ligada. Padrão
    /// desligado: Salas privadas e servidores sem o item nunca mostram o card.
    /// </summary>
    [JsonPropertyName("AddonEnabled")]
    public bool AddonEnabled { get; set; }

    /// <summary>Quanto tempo o card de boas-vindas fica na tela, em segundos.</summary>
    [JsonPropertyName("CardSeconds")]
    public float CardSeconds { get; set; } = 6f;

    /// <summary>O material do logo nas paredes, dentro do addon.</summary>
    [JsonPropertyName("WallLogoMaterial")]
    public string WallLogoMaterial { get; set; } = "materials/carmine/wall_logo.vmat";

    /// <summary>O modo da Vaga reservada; lança se o texto não é um dos aceitos.</summary>
    [JsonIgnore]
    public ReservedSlotsMode ReservedSlotsMode => Core.ReservedSlots.ParseMode(ReservedSlots);
}
