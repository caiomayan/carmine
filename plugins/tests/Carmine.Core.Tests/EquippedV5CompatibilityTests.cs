using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;

namespace Carmine.Core.Tests;

/// <summary>
/// A resposta de <c>GET /api/equipped/v5/{steamId}.json</c> precisa ser lida pelo
/// cs2-css-inventory-simulator sem modificação (ADR 0006). O modelo abaixo é uma cópia reduzida
/// do <c>EquippedV5Response</c> do plugin (MIT, © Ian Lucas), com os mesmos tipos de chave.
/// </summary>
public class EquippedV5CompatibilityTests
{
    /// <summary>O mesmo corpo verificado em apps/api/test/equipped.int-spec.ts.</summary>
    private const string EmptyLoadout = """{"agents":{},"ctWeapons":{},"gloves":{},"knives":{},"tWeapons":{}}""";

    private sealed class InventoryItem
    {
        [JsonPropertyName("def")]
        public ushort? Def { get; set; }
    }

    private sealed class EquippedV5Response
    {
        [JsonPropertyName("agents")]
        public Dictionary<byte, InventoryItem> Agents { get; set; } = [];

        [JsonPropertyName("ctWeapons")]
        public Dictionary<ushort, InventoryItem> CTWeapons { get; set; } = [];

        [JsonPropertyName("gloves")]
        public Dictionary<byte, InventoryItem> Gloves { get; set; } = [];

        [JsonPropertyName("knives")]
        public Dictionary<byte, InventoryItem> Knives { get; set; } = [];

        [JsonPropertyName("musicKit")]
        public InventoryItem? MusicKit { get; set; }

        [JsonPropertyName("tWeapons")]
        public Dictionary<ushort, InventoryItem> TWeapons { get; set; } = [];
    }

    [Fact]
    public void O_plugin_le_o_Loadout_vazio_como_so_Armas_padrao()
    {
        var equipped = JsonSerializer.Deserialize<EquippedV5Response>(EmptyLoadout);

        Assert.NotNull(equipped);
        Assert.Empty(equipped.Agents);
        Assert.Empty(equipped.CTWeapons);
        Assert.Empty(equipped.Gloves);
        Assert.Empty(equipped.Knives);
        Assert.Empty(equipped.TWeapons);
        Assert.Null(equipped.MusicKit);
    }
}
