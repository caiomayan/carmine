using System.Net;
using System.Text.Json;
using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class EventReporterTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 18, 18, 0, 0, TimeSpan.Zero);

    private static HttpResponseMessage Accepted(SentRequest _) =>
        StubHandler.Json(HttpStatusCode.OK, """{"accepted":1,"duplicates":0,"ignored":0}""");

    private static HttpResponseMessage ApiDown(SentRequest _) => throw new HttpRequestException("Connection refused");

    private static HttpResponseMessage Invalid(SentRequest _) =>
        StubHandler.Json(HttpStatusCode.BadRequest, """{"statusCode":400,"message":"Corpo inválido"}""");

    private static KillEvent Kill(int n) => new()
    {
        Id = new Guid(n, 0, 0, [0, 0, 0, 0, 0, 0, 0, 1]),
        At = Now,
        KillerSteamId = "76561198000000001",
        VictimSteamId = "76561198000000002",
        Weapon = "ak47",
    };

    private static SessionStartEvent Start(int n) => new()
    {
        Id = new Guid(n, 1, 0, [0, 0, 0, 0, 0, 0, 0, 1]),
        At = Now,
        SessionId = new Guid(n, 2, 0, [0, 0, 0, 0, 0, 0, 0, 1]),
        SteamId = "76561198000000001",
    };

    private sealed class Fixture : IDisposable
    {
        public FakeTimeProvider Time { get; } = new(Now);
        public StubHandler Api { get; }
        public EventReporter Reporter { get; }

        public Fixture(Func<SentRequest, HttpResponseMessage> respond, int maxQueued = 5000, int batchSize = 200)
        {
            Api = new StubHandler(respond);
            Reporter = new EventReporter(CarmineApi.CreateClient(StubHandler.Options, Api), Time, maxQueued, batchSize);
        }

        public void Dispose() => Api.Dispose();

        public List<Guid> SentKillIds() =>
            [.. Api.Requests.SelectMany(r => JsonDocument.Parse(r.Body).RootElement.GetProperty("kills").EnumerateArray())
                .Select(k => k.GetProperty("id").GetGuid())];
    }

    [Fact]
    public async Task Manda_os_eventos_da_fila_num_lote_com_a_chave_do_servidor_e_esvazia_a_fila()
    {
        using var f = new Fixture(Accepted);
        f.Reporter.Add(Kill(1));
        f.Reporter.Add(Start(1));

        var report = await f.Reporter.FlushAsync(TestContext.Current.CancellationToken);

        Assert.Equal(2, report.Sent);
        Assert.Equal(0, f.Reporter.Count);
        var sent = Assert.Single(f.Api.Requests);
        Assert.Equal(new Uri("http://api.test/api/server/events"), sent.Uri);
        Assert.Equal("Bearer chave-do-servidor", sent.Authorization);
        var body = JsonDocument.Parse(sent.Body).RootElement;
        Assert.Equal(1, body.GetProperty("kills").GetArrayLength());
        Assert.Equal(1, body.GetProperty("sessionStarts").GetArrayLength());
        Assert.Equal(0, body.GetProperty("damages").GetArrayLength());
    }

    [Fact]
    public async Task Fila_vazia_nao_chama_a_API()
    {
        using var f = new Fixture(Accepted);

        var report = await f.Reporter.FlushAsync(TestContext.Current.CancellationToken);

        Assert.Equal(EventFlushReport.Nothing, report);
        Assert.Empty(f.Api.Requests);
    }

    [Fact]
    public async Task Divide_a_fila_em_lotes_do_tamanho_maximo()
    {
        using var f = new Fixture(Accepted, batchSize: 2);
        for (var n = 1; n <= 5; n++)
        {
            f.Reporter.Add(Kill(n));
        }

        var report = await f.Reporter.FlushAsync(TestContext.Current.CancellationToken);

        Assert.Equal(5, report.Sent);
        Assert.Equal(3, f.Api.Requests.Count);
    }

    [Fact]
    public async Task Com_a_API_fora_os_eventos_ficam_e_o_reenvio_leva_os_mesmos_IDs()
    {
        using var f = new Fixture(ApiDown);
        f.Reporter.Add(Kill(1));
        f.Reporter.Add(Kill(2));
        var token = TestContext.Current.CancellationToken;

        var down = await f.Reporter.FlushAsync(token);
        f.Time.Advance(TimeSpan.FromSeconds(5));
        f.Api.Respond = Accepted;
        var back = await f.Reporter.FlushAsync(token);

        Assert.Equal("API inacessível: Connection refused", down.WentDown);
        Assert.Equal(0, down.Sent);
        Assert.True(back.CameBack);
        Assert.Equal(2, back.Sent);
        Assert.Equal(0, f.Reporter.Count);
        var ids = f.SentKillIds();
        Assert.Equal(4, ids.Count);
        Assert.Equal(ids[..2], ids[2..]);
    }

    [Fact]
    public async Task Recua_em_vez_de_insistir_e_dobra_a_espera_a_cada_falha()
    {
        using var f = new Fixture(ApiDown);
        f.Reporter.Add(Kill(1));
        var token = TestContext.Current.CancellationToken;

        await f.Reporter.FlushAsync(token);
        f.Time.Advance(TimeSpan.FromSeconds(4));
        await f.Reporter.FlushAsync(token);
        Assert.Single(f.Api.Requests);

        f.Time.Advance(TimeSpan.FromSeconds(1));
        var second = await f.Reporter.FlushAsync(token);
        Assert.Equal(2, f.Api.Requests.Count);
        Assert.Null(second.WentDown);

        f.Time.Advance(TimeSpan.FromSeconds(9));
        await f.Reporter.FlushAsync(token);
        Assert.Equal(2, f.Api.Requests.Count);

        f.Time.Advance(TimeSpan.FromSeconds(1));
        await f.Reporter.FlushAsync(token);
        Assert.Equal(3, f.Api.Requests.Count);
    }

    [Fact]
    public async Task O_recuo_para_em_5_minutos()
    {
        using var f = new Fixture(ApiDown);
        f.Reporter.Add(Kill(1));
        var token = TestContext.Current.CancellationToken;

        for (var i = 0; i < 10; i++)
        {
            f.Time.Advance(TimeSpan.FromMinutes(6));
            await f.Reporter.FlushAsync(token);
        }
        var before = f.Api.Requests.Count;
        f.Time.Advance(TimeSpan.FromMinutes(5));
        await f.Reporter.FlushAsync(token);

        Assert.Equal(before + 1, f.Api.Requests.Count);
    }

    [Fact]
    public async Task Fila_cheia_descarta_os_mais_antigos_e_conta_no_relatorio()
    {
        using var f = new Fixture(ApiDown, maxQueued: 3);
        for (var n = 1; n <= 5; n++)
        {
            f.Reporter.Add(Kill(n));
        }

        var report = await f.Reporter.FlushAsync(TestContext.Current.CancellationToken);

        Assert.Equal(2, report.Dropped);
        Assert.Equal(3, f.Reporter.Count);
        Assert.Equal([3, 4, 5], f.Reporter.Snapshot().Kills.Select(k => k.Id.ToString()[..8]).Select(h => Convert.ToInt32(h, 16)));
    }

    [Fact]
    public async Task Lote_que_a_API_recusa_e_descartado_para_nao_travar_a_fila()
    {
        using var f = new Fixture(Invalid, batchSize: 1);
        f.Reporter.Add(Kill(1));
        f.Reporter.Add(Kill(2));

        var report = await f.Reporter.FlushAsync(TestContext.Current.CancellationToken);

        Assert.Equal(0, f.Reporter.Count);
        Assert.Equal(2, report.Dropped);
        Assert.Equal(0, report.Sent);
        Assert.Contains("HTTP 400", report.Rejected);
    }

    [Fact]
    public async Task O_envio_final_ignora_o_recuo_e_tenta_uma_vez()
    {
        using var f = new Fixture(ApiDown, batchSize: 1);
        f.Reporter.Add(Kill(1));
        f.Reporter.Add(Kill(2));
        var token = TestContext.Current.CancellationToken;
        await f.Reporter.FlushAsync(token);
        f.Api.Respond = Accepted;

        var report = await f.Reporter.FlushAsync(final: true, token);

        Assert.Equal(1, report.Sent);
        Assert.Equal(2, f.Api.Requests.Count);
        Assert.Equal(1, f.Reporter.Count);
    }

    [Fact]
    public async Task Evento_adicionado_durante_o_envio_nao_e_perdido()
    {
        using var f = new Fixture(Accepted);
        f.Reporter.Add(Kill(1));
        var added = false;
        f.Api.Respond = request =>
        {
            if (!added)
            {
                added = true;
                f.Reporter.Add(Kill(2));
            }
            return Accepted(request);
        };

        var report = await f.Reporter.FlushAsync(TestContext.Current.CancellationToken);

        Assert.Equal(2, report.Sent);
        Assert.Equal(0, f.Reporter.Count);
        Assert.Equal(2, f.Api.Requests.Count);
    }
}
