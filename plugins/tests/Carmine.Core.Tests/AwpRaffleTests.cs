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
