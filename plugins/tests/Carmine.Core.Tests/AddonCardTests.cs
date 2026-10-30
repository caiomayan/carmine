using System.Net;
using System.Text.Json;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class AddonCardTests
{
    private const ulong Player = 76561198000000001;

    private static JsonElement Contract()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var file = Path.Combine(dir.FullName, "infra", "cs2", "addon", "addon.contract.json");
            if (File.Exists(file))
            {
                return JsonDocument.Parse(File.ReadAllText(file)).RootElement;
            }
        }
        throw new FileNotFoundException("infra/cs2/addon/addon.contract.json não encontrado a partir de " + AppContext.BaseDirectory);
    }

    private static PlayerCard Card(string plan = "VIP", string rank = "8º no Ranking de Retake", string friends = "3 amigos online", string rating = "") =>
        new() { Name = "Gabriel", Plan = plan, Rank = rank, Friends = friends, Rating = rating };

    [Fact]
    public void O_plugin_e_o_addon_concordam_nos_nomes()
    {
        var contract = Contract();

        Assert.Equal(AddonCard.LayoutResource, contract.GetProperty("layout").GetString());
        Assert.Equal(AddonCard.PanelId, contract.GetProperty("panel").GetString());
        Assert.Equal(AddonCard.HiddenClass, contract.GetProperty("hiddenClass").GetString());
        Assert.Equal(AddonCard.RowHiddenClass, contract.GetProperty("rowHiddenClass").GetString());
        Assert.Equal(
            contract.GetProperty("variables").EnumerateArray().Select(v => v.GetString()),
            AddonCard.Variables);
        foreach (var (variable, panel) in contract.GetProperty("rowPanels").EnumerateObject().Select(p => (p.Name, p.Value.GetString())))
        {
            Assert.Equal(panel, AddonCard.RowPanels[variable]);
        }
        Assert.Equal(AddonCard.WallLogoMaterial, contract.GetProperty("wallLogoMaterial").GetString());
    }

    [Fact]
    public void As_variaveis_saem_na_ordem_do_contrato()
    {
        var variables = AddonCard.VariablesFor(Card());

        Assert.Equal(AddonCard.Variables, variables.Select(v => v.Variable));
        Assert.Equal("Gabriel", variables[0].Value);
        Assert.Equal("VIP", variables[1].Value);
    }

    [Fact]
    public void Linha_sem_texto_fica_escondida_e_com_texto_aparece()
    {
        var rows = AddonCard.RowsFor(Card(plan: "", rating: "")).ToDictionary(r => r.Panel, r => r.Hidden);

        Assert.True(rows["carmine_row_plan"]);
        Assert.False(rows["carmine_row_rank"]);
        Assert.False(rows["carmine_row_friends"]);
        Assert.True(rows["carmine_row_rating"]);
    }

    [Fact]
    public void Sem_resposta_da_API_o_card_mostra_so_o_nome()
    {
        var only = AddonCard.OnlyName("Gabriel");

        Assert.Equal("Gabriel", only.Name);
        Assert.All(AddonCard.RowsFor(only), row => Assert.True(row.Hidden));
    }

    [Fact]
    public void O_card_espera_o_primeiro_spawn_e_sai_uma_vez_por_conexao()
    {
        using var api = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var card = new WelcomeCard(CarmineApi.CreateClient(StubHandler.Options, api));

        Assert.False(card.OnConnectResult(Player, isAlive: false));
        Assert.True(card.TakeOnSpawn(Player));
        Assert.False(card.TakeOnSpawn(Player));
    }

    [Fact]
    public void Com_o_jogador_ja_vivo_o_card_sai_na_hora_e_quem_sai_antes_de_nascer_nao_deixa_nada()
    {
        using var api = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var card = new WelcomeCard(CarmineApi.CreateClient(StubHandler.Options, api));

        Assert.True(card.OnConnectResult(Player, isAlive: true));
        Assert.False(card.TakeOnSpawn(Player));

        card.OnConnectResult(Player, isAlive: false);
        card.OnDisconnect(Player);
        Assert.False(card.TakeOnSpawn(Player));
    }

    [Fact]
    public async Task Os_textos_vem_da_API_com_a_chave_do_servidor()
    {
        using var api = new StubHandler(_ => StubHandler.Json(
            HttpStatusCode.OK,
            """{"name":"Gabriel","plan":"VIP","rank":"8º no Ranking de Retake","friends":"","rating":""}"""));
        var card = new WelcomeCard(CarmineApi.CreateClient(StubHandler.Options, api));

        var fetched = await card.FetchAsync(Player, CancellationToken.None);

        Assert.Equal("8º no Ranking de Retake", fetched?.Rank);
        var sent = Assert.Single(api.Requests);
        Assert.Equal(new Uri($"http://api.test/api/server/players/{Player}/card"), sent.Uri);
        Assert.Equal("Bearer chave-do-servidor", sent.Authorization);
    }

    [Fact]
    public async Task Com_a_API_fora_ou_sem_a_Conta_o_card_nao_quebra()
    {
        using var down = new StubHandler(_ => throw new HttpRequestException("Connection refused"));
        using var missing = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

        Assert.Null(await new WelcomeCard(CarmineApi.CreateClient(StubHandler.Options, down)).FetchAsync(Player, CancellationToken.None));
        Assert.Null(await new WelcomeCard(CarmineApi.CreateClient(StubHandler.Options, missing)).FetchAsync(Player, CancellationToken.None));
    }

    [Fact]
    public void O_card_dura_6_segundos_por_padrao()
    {
        Assert.Equal(6f, AddonCard.DefaultSeconds);
    }
}

public class WallLogosTests
{
    [Fact]
    public void Le_os_pontos_do_mapa_sem_diferenciar_maiusculas()
    {
        var logos = WallLogos.Parse(
            """{"maps":{"de_mirage":[{"x":1,"y":2,"z":3,"yaw":90},{"x":4,"y":5,"z":6,"width":64,"height":32}]}}""",
            out var error);

        Assert.Null(error);
        var points = logos.For("DE_MIRAGE");
        Assert.Equal(2, points.Count);
        Assert.Equal(90f, points[0].Yaw);
        Assert.Equal(WallLogoPoint.DefaultSize, points[0].Width);
        Assert.Equal(64f, points[1].Width);
    }

    [Fact]
    public void Mapa_fora_do_arquivo_e_arquivo_vazio_nao_colocam_nada()
    {
        Assert.Empty(WallLogos.Parse("""{"maps":{}}""", out _).For("de_inferno"));
        Assert.Empty(WallLogos.Parse(null, out var error).For("de_inferno"));
        Assert.Null(error);
    }

    [Fact]
    public void Arquivo_invalido_nao_derruba_o_servidor_e_diz_o_motivo()
    {
        var logos = WallLogos.Parse("{ isto nao e json", out var error);

        Assert.NotNull(error);
        Assert.Empty(logos.For("de_mirage"));
    }

    [Fact]
    public void O_teto_por_mapa_e_o_tamanho_invalido_sao_respeitados()
    {
        var many = string.Join(",", Enumerable.Range(0, 10).Select(i => "{\"x\":" + i + ",\"y\":0,\"z\":0}"));
        var json = "{\"maps\":{\"de_mirage\":[" + many + "],\"de_dust2\":[{\"x\":1,\"y\":1,\"z\":1,\"width\":0}]}}";
        var logos = WallLogos.Parse(json, out _);

        Assert.Equal(WallLogos.MaxPointsPerMap, logos.For("de_mirage").Count);
        Assert.Empty(logos.For("de_dust2"));
    }

    [Fact]
    public void A_linha_do_ponto_pode_ser_colada_de_volta_no_arquivo()
    {
        var point = new WallLogoPoint(1.5f, 2.5f, 3.5f, 90f, 180f);

        var logos = WallLogos.Parse("{\"maps\":{\"de_mirage\":[" + WallLogos.Describe(point) + "]}}", out var error);

        Assert.Null(error);
        Assert.Equal(point, Assert.Single(logos.For("de_mirage")));
    }
}
