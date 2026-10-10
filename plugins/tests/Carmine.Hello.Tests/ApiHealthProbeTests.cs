using System.Net;
using System.Text;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Hello.Tests;

public class ApiHealthProbeTests
{
    private const string AllUp =
        """{"status":"ok","checks":{"database":{"status":"up","latencyMs":3},"valkey":{"status":"up","latencyMs":1}}}""";

    private const string ValkeyDown =
        """{"status":"unavailable","checks":{"database":{"status":"up","latencyMs":3},"valkey":{"status":"down","latencyMs":2000,"error":"sem resposta em 2000 ms"}}}""";

    private static readonly CarmineApiOptions Options =
        new(new Uri("http://api.test"), ApiKey: "chave-do-servidor", Timeout: TimeSpan.FromSeconds(5));

    [Fact]
    public async Task Informa_que_a_API_esta_no_ar_com_a_latencia_de_cada_dependencia()
    {
        using var handler = new StubHandler(_ => Json(HttpStatusCode.OK, AllUp));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(Options, handler));

        var result = await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.True(result.Healthy);
        Assert.Equal("API no ar (Postgres 3 ms, Valkey 1 ms)", result.Summary);
    }

    [Fact]
    public async Task Aponta_a_dependencia_fora_do_ar_quando_a_API_responde_503()
    {
        using var handler = new StubHandler(_ => Json(HttpStatusCode.ServiceUnavailable, ValkeyDown));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(Options, handler));

        var result = await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.False(result.Healthy);
        Assert.Equal("API com dependência fora do ar: Valkey (sem resposta em 2000 ms)", result.Summary);
    }

    [Fact]
    public async Task Informa_que_a_API_esta_inacessivel_quando_a_conexao_falha()
    {
        using var handler = new StubHandler(_ => throw new HttpRequestException("Connection refused"));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(Options, handler));

        var result = await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.False(result.Healthy);
        Assert.Equal("API inacessível em http://api.test/: Connection refused", result.Summary);
    }

    [Fact]
    public async Task Informa_o_status_HTTP_inesperado()
    {
        using var handler = new StubHandler(_ => Json(HttpStatusCode.Unauthorized, """{"message":"Unauthorized"}"""));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(Options, handler));

        var result = await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.False(result.Healthy);
        Assert.Equal("API respondeu HTTP 401", result.Summary);
    }

    [Fact]
    public async Task Envia_a_chave_do_servidor_e_chama_o_health_check()
    {
        HttpRequestMessage? sent = null;
        using var handler = new StubHandler(request =>
        {
            sent = request;
            return Json(HttpStatusCode.OK, AllUp);
        });
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(Options, handler));

        await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.NotNull(sent);
        Assert.Equal(new Uri("http://api.test/api/health"), sent.RequestUri);
        Assert.Equal(["chave-do-servidor"], sent.Headers.GetValues(CarmineApi.ServerKeyHeader));
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(respond(request));
    }
}
