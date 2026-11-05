using System.Net;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class DeathmatchPreferencesTests
{
    private const ulong Player = 76561198000000001;

    private static GamePreferences Account(bool hitSound = true, bool killSound = false) => new()
    {
        AwpRaffle = false,
        KillSound = killSound,
        HeadshotKillSound = true,
        KnifeKillSound = false,
        HitSound = hitSound,
        NewModeSound = true,
        NoPrimary = false,
        OnlyHeadshot = true,
        HudMessages = true,
        DamageInfo = false,
    };

    private static (DeathmatchPreferences Prefs, StubHandler Api) Make(Func<SentRequest, HttpResponseMessage> respond)
    {
        var api = new StubHandler(respond);
        return (new DeathmatchPreferences(CarmineApi.CreateClient(StubHandler.Options, api)), api);
    }

    [Fact]
    public void Cada_chave_da_Conta_tem_o_nome_da_preferencia_no_Deathmatch_v1_3_6()
    {
        // Os nomes são os de RegisterPreference no fonte do plugin (Functions/Menus.cs), não os do Deathmatch.json.
        Assert.Equal(
            ["KillSound", "HeadshotKillSound", "KnifeKillSound", "HitSound", "NewModeSound", "NoPrimary", "OnlyHS", "HudMessages", "DamageInfo"],
            DeathmatchPreferences.Map.Select(m => m.PluginName));
        Assert.Equal(DeathmatchPreferences.Map.Count, DeathmatchPreferences.Map.Select(m => m.Key).Distinct().Count());
        Assert.Equal(GamePreferenceKey.Only_headshot, DeathmatchPreferences.KeyFor("OnlyHS"));
        Assert.Null(DeathmatchPreferences.KeyFor("AwpRaffle"));
        Assert.Null(DeathmatchPreferences.KeyFor("Desconhecida"));
    }

    [Fact]
    public void Os_valores_aplicados_sao_os_da_Conta_para_todas_as_nove_preferencias()
    {
        var values = DeathmatchPreferences.ValuesOf(Account(hitSound: false, killSound: true));

        Assert.Equal(9, values.Count);
        Assert.False(values["HitSound"]);
        Assert.True(values["KillSound"]);
        Assert.True(values["OnlyHS"]);
        Assert.False(values["DamageInfo"]);
        Assert.All(DeathmatchPreferences.Map, m => Assert.True(values.ContainsKey(m.PluginName)));
    }

    [Fact]
    public void No_connect_com_o_jogador_na_escolha_de_time_os_valores_esperam_o_spawn_e_saem_uma_vez()
    {
        var (prefs, api) = Make(_ => new HttpResponseMessage(HttpStatusCode.OK));
        using var _ = api;

        Assert.Null(prefs.OnConnectResult(Player, Account(), isAlive: false));

        var onSpawn = prefs.TakeOnSpawn(Player);
        Assert.NotNull(onSpawn);
        Assert.Equal(9, onSpawn.Count);
        Assert.Null(prefs.TakeOnSpawn(Player));
    }

    [Fact]
    public void Com_o_jogador_ja_vivo_os_valores_sao_aplicados_na_hora()
    {
        var (prefs, api) = Make(_ => new HttpResponseMessage(HttpStatusCode.OK));
        using var _ = api;

        var now = prefs.OnConnectResult(Player, Account(hitSound: false), isAlive: true);

        Assert.NotNull(now);
        Assert.False(now["HitSound"]);
        Assert.Null(prefs.TakeOnSpawn(Player));
    }

    [Fact]
    public void Quem_sai_antes_de_nascer_nao_deixa_estado_para_a_proxima_conexao()
    {
        var (prefs, api) = Make(_ => new HttpResponseMessage(HttpStatusCode.OK));
        using var _ = api;
        prefs.OnConnectResult(Player, Account(), isAlive: false);

        prefs.OnDisconnect(Player);

        Assert.Null(prefs.TakeOnSpawn(Player));
    }

    [Fact]
    public void Se_o_plugin_recusou_porque_nao_tinha_os_dados_os_valores_voltam_para_o_proximo_spawn()
    {
        var (prefs, api) = Make(_ => new HttpResponseMessage(HttpStatusCode.OK));
        using var _ = api;
        prefs.OnConnectResult(Player, Account(), isAlive: false);
        var taken = prefs.TakeOnSpawn(Player)!;

        prefs.Requeue(Player, taken);

        Assert.Same(taken, prefs.TakeOnSpawn(Player));
    }

    [Fact]
    public void O_reenvio_nao_pisa_num_connect_mais_novo()
    {
        var (prefs, api) = Make(_ => new HttpResponseMessage(HttpStatusCode.OK));
        using var _ = api;
        var old = DeathmatchPreferences.ValuesOf(Account(hitSound: true));
        prefs.OnConnectResult(Player, Account(hitSound: false), isAlive: false);

        prefs.Requeue(Player, old);

        Assert.False(prefs.TakeOnSpawn(Player)!["HitSound"]);
    }

    [Fact]
    public async Task O_que_o_jogador_muda_vai_para_a_API_como_valor_explicito_com_a_chave_da_Conta()
    {
        var (prefs, api) = Make(_ => StubHandler.Json(HttpStatusCode.OK, """{"key":"hit_sound","enabled":false}"""));
        using var _ = api;

        Assert.True(await prefs.EnqueueSave(Player, GamePreferenceKey.Hit_sound, enabled: false, CancellationToken.None));

        var sent = Assert.Single(api.Requests);
        Assert.Equal(HttpMethod.Put, sent.Method);
        Assert.Equal(new Uri($"http://api.test/api/server/players/{Player}/preferences/hit_sound"), sent.Uri);
        Assert.Equal("Bearer chave-do-servidor", sent.Authorization);
        Assert.Contains("\"enabled\":false", sent.Body.Replace(" ", ""));
    }

    [Fact]
    public async Task Com_a_API_fora_ou_a_Conta_desconhecida_nao_grava_e_nao_lanca()
    {
        var (down, apiDown) = Make(_ => throw new HttpRequestException("Connection refused"));
        using var _1 = apiDown;
        var (unknown, apiUnknown) = Make(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        using var _2 = apiUnknown;

        Assert.False(await down.EnqueueSave(Player, GamePreferenceKey.Kill_sound, true, CancellationToken.None));
        Assert.False(await unknown.EnqueueSave(Player, GamePreferenceKey.Kill_sound, true, CancellationToken.None));
    }

    [Fact]
    public async Task Dois_toggles_rapidos_do_mesmo_jogador_e_chave_chegam_a_API_na_ordem()
    {
        var order = new List<string>();
        var (prefs, api) = Make(request =>
        {
            lock (order)
            {
                order.Add(request.Body.Contains("true") ? "true" : "false");
            }
            if (order.Count == 1)
            {
                Thread.Sleep(300); // o primeiro PUT demora; sem a fila o segundo passaria na frente
            }
            return StubHandler.Json(HttpStatusCode.OK, """{"key":"hit_sound","enabled":true}""");
        });
        using var _ = api;

        var first = prefs.EnqueueSave(Player, GamePreferenceKey.Hit_sound, enabled: true, CancellationToken.None);
        var second = prefs.EnqueueSave(Player, GamePreferenceKey.Hit_sound, enabled: false, CancellationToken.None);

        Assert.True(await first);
        Assert.True(await second);
        Assert.Equal(["true", "false"], order);
    }

    [Fact]
    public async Task Uma_gravacao_que_falha_nao_trava_a_fila()
    {
        var calls = 0;
        var (prefs, api) = Make(_ => ++calls == 1
            ? throw new HttpRequestException("Connection refused")
            : StubHandler.Json(HttpStatusCode.OK, """{"key":"hit_sound","enabled":false}"""));
        using var _ = api;

        var first = prefs.EnqueueSave(Player, GamePreferenceKey.Hit_sound, true, CancellationToken.None);
        var second = prefs.EnqueueSave(Player, GamePreferenceKey.Hit_sound, false, CancellationToken.None);

        Assert.False(await first);
        Assert.True(await second);
    }

    [Fact]
    public void A_ponte_usa_so_os_membros_publicos_que_o_patch_acrescenta()
    {
        // O CounterStrikeSharp.API não existe no teste (só no servidor), então a ponte não roda aqui; este guarda os
        // nomes contra o patch (infra/cs2/deathmatch-patch) e contra a reflexão sobre campo privado, que o ADR 0028 descartou.
        var bridge = File.ReadAllText(FindRepoFile("plugins", "src", "Carmine.Core", "DeathmatchBridge.cs"));
        var patch = File.ReadAllText(FindRepoFile("infra", "cs2", "deathmatch-patch", "0001-preferencias-por-jogador.patch"));

        foreach (var member in new[] { "SetPlayerPreference", "OnPlayerPreferenceChanged" })
        {
            Assert.Contains(member, bridge);
            Assert.Contains(member, patch);
        }
        Assert.Contains("DeathmatchEventHandlers", bridge); // evento que o plugin já tem; o patch só acrescenta o tipo do evento
        Assert.DoesNotContain("BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.GetField", bridge);
        Assert.DoesNotContain("playerData", bridge);
    }

    [Fact]
    public void O_Core_so_cria_a_ponte_e_aplica_no_Deathmatch_e_nao_no_Retake()
    {
        var source = File.ReadAllText(FindRepoFile("plugins", "src", "Carmine.Core", "CorePlugin.cs"));

        Assert.Contains("Config.ReservedSlotsMode == ReservedSlotsMode.Deathmatch", source);
        Assert.Contains("new PluginCapability<object>(\"deathmatch\")", source);
    }

    private static string FindRepoFile(params string[] parts)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var file = Path.Combine(parts.Prepend(dir.FullName).ToArray());
            if (File.Exists(file))
            {
                return file;
            }
        }
        throw new FileNotFoundException(string.Join("/", parts));
    }
}
