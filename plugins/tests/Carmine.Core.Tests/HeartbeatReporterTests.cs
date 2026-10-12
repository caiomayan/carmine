using System.Net;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class HeartbeatReporterTests
{
    private static readonly ServerSnapshot Snapshot =
        new("de_mirage", [76561198000000001, 76561198000000002], MaxPlayers: 9);

    private static HttpResponseMessage Ok(SentRequest _) =>
        StubHandler.Json(HttpStatusCode.OK, """{"hostname":"Carmine | Retake · Rotação | SP·1","sanctions":[]}""");

    private static HttpResponseMessage ApiDown(SentRequest _) => throw new HttpRequestException("Connection refused");

    private sealed class Fixture : IDisposable
    {
        public StubHandler Api { get; }
        public HeartbeatReporter Reporter { get; }

        public Fixture(Func<SentRequest, HttpResponseMessage> respond)
        {
            Api = new StubHandler(respond);
            Reporter = new HeartbeatReporter(CarmineApi.CreateClient(StubHandler.Options, Api));
        }

        public void Dispose() => Api.Dispose();
    }

    [Fact]
    public async Task Envia_mapa_jogadores_como_texto_e_vagas_publicas_com_a_chave_do_servidor()
    {
        using var f = new Fixture(Ok);

        var report = await f.Reporter.SendAsync(Snapshot, TestContext.Current.CancellationToken);

        Assert.Equal(HeartbeatReportKind.Sent, report.Kind);
        Assert.Equal("Carmine | Retake · Rotação | SP·1", report.Result?.Hostname);
        var sent = Assert.Single(f.Api.Requests);
        Assert.Equal(HttpMethod.Post, sent.Method);
        Assert.Equal(new Uri("http://api.test/api/server/heartbeat"), sent.Uri);
        Assert.Equal("Bearer chave-do-servidor", sent.Authorization);
        Assert.Equal(
            """{"map":"de_mirage","players":["76561198000000001","76561198000000002"],"maxPlayers":9}""",
            sent.Body);
    }

    [Fact]
    public async Task Com_a_API_fora_avisa_a_queda_uma_vez_so_e_a_volta_quando_ela_responde()
    {
        using var f = new Fixture(ApiDown);
        var token = TestContext.Current.CancellationToken;

        var first = await f.Reporter.SendAsync(Snapshot, token);
        var second = await f.Reporter.SendAsync(Snapshot, token);
        f.Api.Respond = Ok;
        var back = await f.Reporter.SendAsync(Snapshot, token);
        var steady = await f.Reporter.SendAsync(Snapshot, token);

        Assert.Equal(HeartbeatReportKind.WentDown, first.Kind);
        Assert.StartsWith("API inacessível", first.Reason);
        Assert.Equal(HeartbeatReport.StillDown, second);
        Assert.Equal(HeartbeatReportKind.CameBack, back.Kind);
        Assert.Equal(HeartbeatReportKind.Sent, steady.Kind);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    public async Task Uma_recusa_da_API_tambem_conta_como_queda_sem_lancar(HttpStatusCode status)
    {
        using var f = new Fixture(_ => new HttpResponseMessage(status));

        var report = await f.Reporter.SendAsync(Snapshot, TestContext.Current.CancellationToken);

        Assert.Equal(HeartbeatReportKind.WentDown, report.Kind);
        Assert.Equal($"API respondeu HTTP {(int)status}", report.Reason);
    }

    [Fact]
    public async Task Nao_guarda_batimentos_perdidos_para_reenviar()
    {
        using var f = new Fixture(ApiDown);
        var token = TestContext.Current.CancellationToken;
        await f.Reporter.SendAsync(Snapshot, token);
        await f.Reporter.SendAsync(Snapshot with { Map = "de_nuke" }, token);
        f.Api.Respond = Ok;

        await f.Reporter.SendAsync(Snapshot with { Map = "de_inferno" }, token);

        Assert.Contains("de_inferno", f.Api.Requests[^1].Body);
        Assert.Equal(3, f.Api.Requests.Count);
    }
}
