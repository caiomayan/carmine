using System.Net;
using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class VipInfoTests
{
    private const ulong Player = 76561198000000001;

    // 27/10/2026, 15:00 em Brasília.
    private static readonly DateTimeOffset Now = new(2026, 10, 27, 18, 0, 0, TimeSpan.Zero);

    private sealed class Fixture : IDisposable
    {
        public StubHandler Api { get; }
        public VipInfo Vip { get; }

        public Fixture(Func<SentRequest, HttpResponseMessage> respond)
        {
            Api = new StubHandler(respond);
            Vip = new VipInfo(CarmineApi.CreateClient(StubHandler.Options, Api), new FakeTimeProvider(Now));
        }

        public void Dispose() => Api.Dispose();
    }

    private static HttpResponseMessage Json(string body) => StubHandler.Json(HttpStatusCode.OK, body);

    private static HttpResponseMessage ApiDown(SentRequest _) => throw new HttpRequestException("Connection refused");

    [Fact]
    public void Tres_dias_antes_diz_em_quantos_dias_e_a_data()
    {
        var ends = new DateTimeOffset(2026, 10, 30, 12, 0, 0, TimeSpan.Zero);

        var message = VipInfo.NoticeMessage(VipNotice.Ending_soon, ends, Now);

        Assert.Equal("Seu VIP acaba em 3 dias (30/10). Para renovar: stcarmine.com/vip", message);
    }

    [Fact]
    public void Um_dia_antes_diz_amanha_e_conta_o_dia_em_Brasilia_nao_em_UTC()
    {
        // 28/10 às 01:00 UTC ainda é 27/10 22:00 em Brasília, o mesmo dia de "agora": a conta é de dias de Brasília.
        var tomorrow = new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero);
        var sameBrasiliaDay = new DateTimeOffset(2026, 10, 28, 1, 0, 0, TimeSpan.Zero);

        Assert.Equal("Seu VIP acaba amanhã (28/10). Para renovar: stcarmine.com/vip", VipInfo.NoticeMessage(VipNotice.Ending_soon, tomorrow, Now));
        Assert.Contains("(27/10)", VipInfo.NoticeMessage(VipNotice.Ending_soon, sameBrasiliaDay, Now));
    }

    [Fact]
    public void No_dia_do_fim_e_no_dia_em_que_acabou()
    {
        Assert.Equal("Seu VIP acaba hoje. Para renovar: stcarmine.com/vip", VipInfo.NoticeMessage(VipNotice.Ending_today, null, Now));
        Assert.Equal("Seu VIP acabou hoje. Para voltar a ter VIP: stcarmine.com/vip", VipInfo.NoticeMessage(VipNotice.Ended_today, null, Now));
    }

    [Fact]
    public void Sem_aviso_nao_ha_mensagem()
    {
        Assert.Null(VipInfo.NoticeMessage(null, null, Now));
    }

    [Fact]
    public void O_aviso_do_connect_espera_o_primeiro_spawn_e_sai_uma_vez_so()
    {
        using var f = new Fixture(_ => throw new InvalidOperationException("não chama a API"));
        f.Vip.OnConnectResult(Player, VipNotice.Ending_today, null);

        Assert.NotNull(f.Vip.TakeOnSpawn(Player));
        Assert.Null(f.Vip.TakeOnSpawn(Player));
    }

    [Fact]
    public void Um_connect_sem_aviso_apaga_o_de_antes_e_sair_tambem()
    {
        using var f = new Fixture(_ => throw new InvalidOperationException("não chama a API"));
        f.Vip.OnConnectResult(Player, VipNotice.Ending_today, null);
        f.Vip.OnConnectResult(Player, null, null);
        Assert.Null(f.Vip.TakeOnSpawn(Player));

        f.Vip.OnConnectResult(Player, VipNotice.Ending_today, null);
        f.Vip.OnDisconnect(Player);
        Assert.Null(f.Vip.TakeOnSpawn(Player));
    }

    [Fact]
    public async Task O_vip_pergunta_a_API_e_diz_ate_quando_vai_no_horario_de_Brasilia()
    {
        using var f = new Fixture(_ => Json("""{"active":true,"endsAt":"2026-11-12T02:30:00.000Z","endedAt":null,"notice":null}"""));

        var message = await f.Vip.StatusAsync(Player, TestContext.Current.CancellationToken);

        // 02:30 UTC de 12/11 ainda é 11/11 em Brasília.
        Assert.Equal("Seu VIP vai até 11/11/2026. Para somar mais dias: stcarmine.com/vip", message);
        var sent = Assert.Single(f.Api.Requests);
        Assert.Equal(HttpMethod.Get, sent.Method);
        Assert.Equal($"/api/server/players/{Player}/vip", sent.Uri?.AbsolutePath);
    }

    [Fact]
    public async Task Sem_VIP_manda_para_a_pagina()
    {
        using var f = new Fixture(_ => Json("""{"active":false,"endsAt":null,"endedAt":null,"notice":null}"""));

        var message = await f.Vip.StatusAsync(Player, TestContext.Current.CancellationToken);

        Assert.Equal("Você não tem VIP agora. Veja como ter: stcarmine.com/vip", message);
    }

    [Fact]
    public async Task Com_a_API_fora_avisa_sem_lancar()
    {
        using var f = new Fixture(ApiDown);

        var message = await f.Vip.StatusAsync(Player, TestContext.Current.CancellationToken);

        Assert.Equal(VipInfo.NoStatusMessage, message);
    }

    [Fact]
    public async Task Com_erro_da_API_avisa_sem_lancar()
    {
        using var f = new Fixture(_ => StubHandler.Json(HttpStatusCode.NotFound, "{}"));

        var message = await f.Vip.StatusAsync(Player, TestContext.Current.CancellationToken);

        Assert.Equal(VipInfo.NoStatusMessage, message);
    }
}
