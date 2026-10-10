using System.Net;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class ApiHealthProbeTests
{
    private const string AllUp =
        """{"status":"ok","checks":{"database":{"status":"up","latencyMs":3},"valkey":{"status":"up","latencyMs":1}}}""";

    private const string ValkeyDown =
        """{"status":"unavailable","checks":{"database":{"status":"up","latencyMs":3},"valkey":{"status":"down","latencyMs":2000,"error":"sem resposta em 2000 ms"}}}""";

    [Fact]
    public async Task Informa_que_a_API_esta_no_ar_com_a_latencia_de_cada_dependencia()
    {
        using var handler = new StubHandler(_ => StubHandler.Json(HttpStatusCode.OK, AllUp));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(StubHandler.Options, handler));

        var result = await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.True(result.Healthy);
        Assert.Equal("API no ar (Postgres 3 ms, Valkey 1 ms)", result.Summary);
    }

    [Fact]
    public async Task Aponta_a_dependencia_fora_do_ar_quando_a_API_responde_503()
    {
        using var handler = new StubHandler(_ => StubHandler.Json(HttpStatusCode.ServiceUnavailable, ValkeyDown));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(StubHandler.Options, handler));

        var result = await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.False(result.Healthy);
        Assert.Equal("API com dependência fora do ar: Valkey (sem resposta em 2000 ms)", result.Summary);
    }

    [Fact]
    public async Task Informa_que_a_API_esta_inacessivel_quando_a_conexao_falha()
    {
        using var handler = new StubHandler(_ => throw new HttpRequestException("Connection refused"));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(StubHandler.Options, handler));

        var result = await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.False(result.Healthy);
        Assert.Equal("API inacessível em http://api.test/: Connection refused", result.Summary);
    }

    [Fact]
    public async Task Avisa_quando_a_API_recusa_a_chave_do_servidor()
    {
        using var handler = new StubHandler(_ => StubHandler.Json(HttpStatusCode.Unauthorized, """{"message":"Unauthorized"}"""));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(StubHandler.Options, handler));

        var result = await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.False(result.Healthy);
        Assert.Equal("API recusou a chave deste servidor: confira ApiKey na config do Carmine.Core", result.Summary);
    }

    [Fact]
    public async Task Informa_o_status_HTTP_inesperado()
    {
        using var handler = new StubHandler(_ => StubHandler.Json(HttpStatusCode.NotFound, """{"message":"Not Found"}"""));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(StubHandler.Options, handler));

        var result = await probe.ProbeAsync(TestContext.Current.CancellationToken);

        Assert.False(result.Healthy);
        Assert.Equal("API respondeu HTTP 404", result.Summary);
    }

    [Fact]
    public async Task Chama_o_health_check_de_servidor_com_a_chave_no_Authorization()
    {
        using var handler = new StubHandler(_ => StubHandler.Json(HttpStatusCode.OK, AllUp));
        var probe = new ApiHealthProbe(CarmineApi.CreateClient(StubHandler.Options, handler));

        await probe.ProbeAsync(TestContext.Current.CancellationToken);

        var sent = Assert.Single(handler.Requests);
        Assert.Equal(new Uri("http://api.test/api/server/health"), sent.Uri);
        Assert.Equal("Bearer chave-do-servidor", sent.Authorization);
    }
}
