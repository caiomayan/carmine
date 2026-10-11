using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;

namespace Carmine.Core.Tests;

/// <summary>
/// A resposta de <c>GET /api/equipped/v5/{steamId}.json</c> precisa ser lida pelo
/// cs2-css-inventory-simulator sem modificação (ADR 0006). Os modelos abaixo são cópias do
/// <c>EquippedV5Response</c>, <c>InventoryItem</c>, <c>StickerItem</c> e <c>KeychainItem</c> do
/// plugin v3.5.2 (MIT, © Ian Lucas), com os mesmos nomes e tipos, lidos com o mesmo
/// <c>JsonSerializer.Deserialize</c> sem opções que o plugin usa.
/// </summary>
public class EquippedV5CompatibilityTests
{
    /// <summary>O mesmo corpo verificado em apps/api/test/equipped.int-spec.ts.</summary>
    private const string EmptyLoadout = """{"agents":{},"ctWeapons":{},"gloves":{},"knives":{},"tWeapons":{}}""";

    /// <summary>
    /// Resposta real da API com cada categoria, gravada por apps/api/test/equipped.int-spec.ts
    /// (que falha se a API passar a responder outra coisa).
    /// </summary>
    private static readonly string FullLoadoutPath = Path.Combine(
        AppContext.BaseDirectory,
        "Fixtures",
        "equipped-v5-full-loadout.json"
    );

    private const byte T = 2;
    private const byte CT = 3;

    private sealed class StickerItem
    {
        [JsonPropertyName("def")]
        public uint Def { get; set; }

        [JsonPropertyName("rotation")]
        public float? Rotation { get; set; }

        [JsonPropertyName("schema")]
        public uint? Schema { get; set; }

        [JsonPropertyName("slot")]
        public uint Slot { get; set; }

        [JsonPropertyName("wear")]
        public float? Wear { get; set; }

        [JsonPropertyName("x")]
        public float? X { get; set; }

        [JsonPropertyName("y")]
        public float? Y { get; set; }
    }

    private sealed class KeychainItem
    {
        [JsonPropertyName("def")]
        public uint Def { get; set; }

        [JsonPropertyName("seed")]
        public int Seed { get; set; }

        [JsonPropertyName("slot")]
        public uint Slot { get; set; }

        [JsonPropertyName("sticker")]
        public uint? Sticker { get; set; }

        [JsonPropertyName("x")]
        public float? X { get; set; }

        [JsonPropertyName("y")]
        public float? Y { get; set; }

        [JsonPropertyName("z")]
        public float? Z { get; set; }
    }

    private sealed class InventoryItem
    {
        [JsonPropertyName("charges")]
        public int? Charges { get; set; }

        [JsonPropertyName("def")]
        public ushort? Def { get; set; }

        [JsonPropertyName("hash")]
        public string? Hash { get; set; }

        [JsonPropertyName("keychains")]
        public List<KeychainItem>? Keychains { get; set; }

        [JsonPropertyName("musicId")]
        public int? MusicId { get; set; }

        [JsonPropertyName("nametag")]
        public string? Nametag { get; set; }

        [JsonPropertyName("paint")]
        public int? Paint { get; set; }

        [JsonPropertyName("petId")]
        public int? PetId { get; set; }

        [JsonPropertyName("seed")]
        public int? Seed { get; set; }

        [JsonPropertyName("stattrak")]
        public int? Stattrak { get; set; }

        [JsonPropertyName("stickers")]
        public List<StickerItem>? Stickers { get; set; }

        [JsonPropertyName("style")]
        public int? Style { get; set; }

        [JsonPropertyName("tint")]
        public int? Tint { get; set; }

        [JsonPropertyName("uid")]
        public int? Uid { get; set; }

        [JsonPropertyName("upgradeLevel")]
        public int? UpgradeLevel { get; set; }

        [JsonPropertyName("wear")]
        public float? Wear { get; set; }
    }

    private sealed class EquippedV5Response
    {
        [JsonPropertyName("agents")]
        public Dictionary<byte, InventoryItem> Agents { get; set; } = [];

        [JsonPropertyName("collectible")]
        public InventoryItem? Collectible { get; set; }

        [JsonPropertyName("ctWeapons")]
        public Dictionary<ushort, InventoryItem> CTWeapons { get; set; } = [];

        [JsonPropertyName("gloves")]
        public Dictionary<byte, InventoryItem> Gloves { get; set; } = [];

        [JsonPropertyName("graffiti")]
        public InventoryItem? Graffiti { get; set; }

        [JsonPropertyName("knives")]
        public Dictionary<byte, InventoryItem> Knives { get; set; } = [];

        [JsonPropertyName("musicKit")]
        public InventoryItem? MusicKit { get; set; }

        [JsonPropertyName("pet")]
        public InventoryItem? Pet { get; set; }

        [JsonPropertyName("tWeapons")]
        public Dictionary<ushort, InventoryItem> TWeapons { get; set; } = [];
    }

    private static EquippedV5Response ReadFullLoadout()
    {
        var equipped = JsonSerializer.Deserialize<EquippedV5Response>(
            File.ReadAllText(FullLoadoutPath)
        );
        Assert.NotNull(equipped);
        return equipped;
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

    [Fact]
    public void Skin_de_arma_traz_float_seed_StatTrak_nametag_stickers_e_charm()
    {
        var ak = ReadFullLoadout().TWeapons[7];

        Assert.Equal((ushort)7, ak.Def);
        Assert.Equal(282, ak.Paint);
        Assert.Equal(0.15f, ak.Wear);
        Assert.Equal(661, ak.Seed);
        Assert.Equal(0, ak.Stattrak);
        Assert.Equal("Carmine", ak.Nametag);
        Assert.NotNull(ak.Uid);
        Assert.Matches("^[0-9a-f]{7}$", ak.Hash);
        Assert.Collection(
            ak.Stickers ?? [],
            sticker =>
            {
                Assert.Equal(0u, sticker.Slot);
                Assert.Equal(1u, sticker.Def);
                Assert.Equal(0u, sticker.Schema);
                Assert.Equal(0.1f, sticker.Wear);
                Assert.Equal(15f, sticker.Rotation);
            },
            sticker =>
            {
                Assert.Equal(1u, sticker.Slot);
                Assert.Equal(2u, sticker.Schema);
                Assert.Equal(0.1f, sticker.X);
                Assert.Equal(0.05f, sticker.Y);
            }
        );
        var keychain = Assert.Single(ak.Keychains ?? []);
        Assert.Equal(37u, keychain.Def);
        Assert.Equal(42, keychain.Seed);
        Assert.Equal(0u, keychain.Slot);
        Assert.Equal(1u, keychain.Sticker);
    }

    [Fact]
    public void Armas_ficam_por_lado_com_o_def_do_jogo_como_chave()
    {
        var equipped = ReadFullLoadout();

        Assert.Equal(new ushort[] { 1, 60 }, equipped.CTWeapons.Keys.Order());
        Assert.Equal(new ushort[] { 1, 7 }, equipped.TWeapons.Keys.Order());
        // Sem StatTrak, o plugin recebe -1 (qualidade normal, sem contador).
        Assert.Equal(-1, equipped.CTWeapons[60].Stattrak);
        Assert.Equal(equipped.CTWeapons[1].Uid, equipped.TWeapons[1].Uid);
    }

    [Fact]
    public void Faca_e_luvas_valem_nos_dois_times()
    {
        var equipped = ReadFullLoadout();

        foreach (var team in new[] { T, CT })
        {
            var knife = equipped.Knives[team];
            Assert.Equal((ushort)500, knife.Def);
            Assert.Equal(5, knife.Paint);
            Assert.Equal(0.07f, knife.Wear);
            Assert.Empty(knife.Stickers ?? []);
            var gloves = equipped.Gloves[team];
            Assert.Equal((ushort)4725, gloves.Def);
            Assert.Equal(10085, gloves.Paint);
            Assert.Equal(0.5f, gloves.Wear);
            Assert.Equal(9, gloves.Seed);
        }
    }

    [Fact]
    public void Agente_vai_por_time()
    {
        var equipped = ReadFullLoadout();

        Assert.Equal((ushort)5105, equipped.Agents[T].Def);
        Assert.Equal((ushort)5305, equipped.Agents[CT].Def);
        Assert.Empty(equipped.Agents[T].Stickers ?? []);
    }

    [Fact]
    public void Music_kit_traz_o_music_id_e_o_StatTrak()
    {
        var musicKit = ReadFullLoadout().MusicKit;

        Assert.NotNull(musicKit);
        Assert.Equal(3, musicKit.MusicId);
        Assert.Equal(0, musicKit.Stattrak);
        Assert.NotNull(musicKit.Uid);
    }
}
