using System.Net;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class AwpRaffleTests
{
    private const ulong Player = 76561198000000001;

    private static (AwpRaffle Awp, StubHandler Api) Make(Func<SentRequest, HttpResponseMessage> respond)
    {
        var api = new StubHandler(respond);
        return (new AwpRaffle(CarmineApi.CreateClient(StubHandler.Options, api)), api);
    }

    [Fact]
    public void Os_comandos_ligam_e_desligam_de_forma_explicita_e_nunca_alternam()
    {
        // css_awp alterna; css_gun define e css_removegun remove (RetakesAllocator 3.0, OnWeaponCommandHelper).
        Assert.Equal("css_gun awp ct", AwpRaffle.CommandFor(true));
        Assert.Equal("css_removegun awp ct", AwpRaffle.CommandFor(false));
        Assert.DoesNotContain("css_awp", AwpRaffle.JoinCommand + AwpRaffle.LeaveCommand);
    }

    [Theory]
    [InlineData("css_awp")]
    [InlineData("CSS_AWP")]
    [InlineData("Css_Awp")]
    public void So_o_Carmine_trata_o_css_awp_em_qualquer_caixa(string command)
    {
        // O chat "!awp" chega como css_awp; o do alocador não pode rodar junto (a Conta e o alocador divergiriam).
        Assert.True(AwpRaffle.OwnsCommand(command));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("awp")]
    [InlineData("css_awp2")]
    [InlineData("css_gun")]
    [InlineData("css_removegun")]
    [InlineData("say")]
    public void Os_outros_comandos_passam_intactos_inclusive_os_que_o_Core_executa_no_alocador(string? command)
    {
        // O Core aplica a AWP com css_gun e css_removegun: eles não podem ser barrados.
        Assert.False(AwpRaffle.OwnsCommand(command));
        Assert.False(AwpRaffle.OwnsCommand(AwpRaffle.JoinCommand.Split(" ")[0]));
        Assert.False(AwpRaffle.OwnsCommand(AwpRaffle.LeaveCommand.Split(" ")[0]));
    }

    [Fact]
    public void O_Core_registra_o_listener_global_que_barra_o_css_awp_do_alocador()
    {
        // A fiação com o jogo não roda no teste; este guarda contra remover o bloqueio sem querer. Um listener por nome
        // não serve: o CounterStrikeSharp roda os handlers de mesmo nome na ordem de registro dos plugins.
        var source = File.ReadAllText(FindRepoFile("plugins", "src", "Carmine.Core", "CorePlugin.cs"));

        Assert.Contains("AddCommandListener(null, OnAnyCommand, HookMode.Pre)", source);
        Assert.Contains("AwpRaffle.OwnsCommand(info.GetArg(0))", source);
        Assert.Contains("return HookResult.Stop;", source);
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
    [Fact]
    public void Os_avisos_sao_os_do_dono()
    {
        Assert.Equal("Você entrou no sorteio da AWP. Para sair, digite !awp.", AwpRaffle.MessageFor(true));
        Assert.Equal("Você saiu do sorteio da AWP. Para voltar, digite !awp.", AwpRaffle.MessageFor(false));
    }

    [Fact]
    public void No_connect_com_o_jogador_na_escolha_de_time_o_estado_espera_o_spawn_e_sai_uma_vez()
    {
        var (awp, api) = Make(_ => new HttpResponseMessage(HttpStatusCode.OK));
        using var _ = api;

        Assert.Null(awp.OnConnectResult(Player, enabled: false, isAlive: false));

        Assert.False(awp.TakeOnSpawn(Player));
        Assert.Null(awp.TakeOnSpawn(Player));
    }

    [Fact]
    public void Com_o_jogador_ja_vivo_o_estado_e_aplicado_na_hora_inclusive_ligado()
    {
        var (awp, api) = Make(_ => new HttpResponseMessage(HttpStatusCode.OK));
        using var _ = api;

        Assert.True(awp.OnConnectResult(Player, enabled: true, isAlive: true));
        Assert.Null(awp.TakeOnSpawn(Player));
    }

    [Fact]
    public void Quem_sai_antes_de_nascer_nao_deixa_estado_para_a_proxima_conexao()
    {
        var (awp, api) = Make(_ => new HttpResponseMessage(HttpStatusCode.OK));
        using var _ = api;
        awp.OnConnectResult(Player, enabled: true, isAlive: false);

        awp.OnDisconnect(Player);

        Assert.Null(awp.TakeOnSpawn(Player));
    }

    [Fact]
    public async Task O_awp_pede_a_API_para_inverter_e_devolve_o_novo_valor()
    {
        var (awp, api) = Make(_ => StubHandler.Json(HttpStatusCode.OK, """{"key":"awp_raffle","enabled":true}"""));
        using var _ = api;

        Assert.True(await awp.ToggleAsync(Player, CancellationToken.None));

        var sent = Assert.Single(api.Requests);
        Assert.Equal(HttpMethod.Post, sent.Method);
        Assert.Equal(new Uri($"http://api.test/api/server/players/{Player}/preferences/awp_raffle/toggle"), sent.Uri);
        Assert.Equal("Bearer chave-do-servidor", sent.Authorization);
    }

    [Fact]
    public async Task Com_a_API_fora_nada_muda_e_o_chamador_recebe_nulo()
    {
        var (awp, api) = Make(_ => throw new HttpRequestException("Connection refused"));
        using var _ = api;

        Assert.Null(await awp.ToggleAsync(Player, CancellationToken.None));
    }

    [Fact]
    public async Task Conta_desconhecida_404_tambem_devolve_nulo()
    {
        var (awp, api) = Make(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        using var _ = api;

        Assert.Null(await awp.ToggleAsync(Player, CancellationToken.None));
    }
}
