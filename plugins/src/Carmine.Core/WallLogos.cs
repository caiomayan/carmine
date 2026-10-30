using System.Text.Json;
using System.Text.Json.Serialization;

namespace Carmine.Core;

/// <summary>Um ponto de parede onde o logo do Carmine aparece (decal), em unidades do jogo e graus.</summary>
public sealed record WallLogoPoint(
    [property: JsonPropertyName("x")] float X,
    [property: JsonPropertyName("y")] float Y,
    [property: JsonPropertyName("z")] float Z,
    [property: JsonPropertyName("pitch")] float Pitch = 0,
    [property: JsonPropertyName("yaw")] float Yaw = 0,
    [property: JsonPropertyName("roll")] float Roll = 0,
    [property: JsonPropertyName("width")] float Width = WallLogoPoint.DefaultSize,
    [property: JsonPropertyName("height")] float Height = WallLogoPoint.DefaultSize)
{
    /// <summary>Lado do logo, em unidades do jogo, quando o ponto não diz.</summary>
    public const float DefaultSize = 96f;
}

/// <summary>
/// Os pontos de parede com o logo do Carmine em cada mapa (S19): 2 ou 3 pontos discretos por mapa do pool,
/// num arquivo do perfil do servidor (<c>cfg/carmine/wall-logos.json</c>). Sem mapa na lista, o servidor não
/// coloca nada. Nada de propaganda de terceiros: o material é sempre o do addon do Carmine.
/// </summary>
public sealed class WallLogos
{
    /// <summary>Teto de pontos por mapa: o logo é discreto, e o arquivo errado não pode encher o mapa de decals.</summary>
    public const int MaxPointsPerMap = 6;

    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    private readonly Dictionary<string, IReadOnlyList<WallLogoPoint>> _maps;

    private WallLogos(Dictionary<string, IReadOnlyList<WallLogoPoint>> maps) => _maps = maps;

    public static WallLogos Empty { get; } = new([]);

    /// <summary>Os pontos do mapa (sem diferenciar maiúsculas); vazio se o mapa não está no arquivo.</summary>
    public IReadOnlyList<WallLogoPoint> For(string map) =>
        _maps.TryGetValue(map, out var points) ? points : [];

    /// <summary>
    /// Lê o arquivo: <c>{ "maps": { "de_mirage": [ { "x": 1, "y": 2, "z": 3, "yaw": 90 } ] } }</c>. Texto inválido
    /// ou vazio não derruba o servidor: devolve a lista vazia e o motivo em <paramref name="error"/>. Pontos além
    /// do teto por mapa e com coordenadas que não são números são descartados.
    /// </summary>
    public static WallLogos Parse(string? json, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(json))
        {
            return Empty;
        }
        try
        {
            var file = JsonSerializer.Deserialize<WallLogosFile>(json, Options);
            var maps = new Dictionary<string, IReadOnlyList<WallLogoPoint>>(StringComparer.OrdinalIgnoreCase);
            foreach (var (map, points) in file?.Maps ?? [])
            {
                var valid = (points ?? [])
                    .Where(point => point is not null && float.IsFinite(point.X) && float.IsFinite(point.Y) && float.IsFinite(point.Z)
                        && point.Width > 0 && point.Height > 0)
                    .Take(MaxPointsPerMap)
                    .ToList();
                if (valid.Count > 0)
                {
                    maps[map] = valid;
                }
            }
            return new WallLogos(maps);
        }
        catch (JsonException exception)
        {
            error = exception.Message;
            return Empty;
        }
    }

    /// <summary>A linha de configuração de um ponto, para o comando de desenvolvimento colar no arquivo.</summary>
    public static string Describe(WallLogoPoint point) =>
        JsonSerializer.Serialize(point, new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.Never });

    private sealed class WallLogosFile
    {
        [JsonPropertyName("maps")]
        public Dictionary<string, List<WallLogoPoint>?>? Maps { get; set; }
    }
}
