using System.Net;
using System.Text.Json;
using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class AccountSyncTests
{
    private const ulong SteamId = 76561198000000001;
    private const ulong OtherSteamId = 76561198000000002;

    private static readonly DateTimeOffset Now = new(2026, 10, 10, 18, 0, 0, TimeSpan.Zero);

    private static string Result(long publicId, string displayName, bool isFirstConnect) =>
        JsonSerializer.Serialize(new { publicId, displayName, isFirstConnect });

    private static HttpResponseMessage Ok(long publicId = 10_016, string displayName = "coldzera", bool first = true) =>
        StubHandler.Json(HttpStatusCode.OK, Result(publicId, displayName, first));

    private static HttpResponseMessage ApiDown(SentRequest _) => throw new HttpRequestException("Connection refused");

    private sealed class Fixture : IDisposable
    {
        public FakeTimeProvider Time { get; } = new(Now);
        public InMemoryPendingConnectsStore Store { get; } = new();
        public StubHandler Api { get; }
        public PendingConnects Pending { get; }
        public AccountSync Sync { get; }

        public Fixture(Func<SentRequest, HttpResponseMessage> respond)
        {
            Api = new StubHandler(respond);
            Pending = new PendingConnects(Store);
            Sync = new AccountSync(CarmineApi.CreateClient(StubHandler.Options, Api), Pending, Time);
        }

        public void Dispose() => Api.Dispose();
    }

    [Fact]
    public async Task Com_a_API_no_ar_devolve_o_Nome_de_exibicao_e_as_boas_vindas()
    {
        using var f = new Fixture(_ => Ok());

        var outcome = await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);

        var synced = Assert.IsType<ConnectOutcome.Synced>(outcome);
        Assert.Equal(10_016, synced.Result.PublicId);
        Assert.Equal("coldzera", synced.Result.DisplayName);
        Assert.True(synced.Result.IsFirstConnect);
    }

    [Fact]
    public async Task Envia_o_SteamID64_como_texto_e_o_nome_com_a_chave_do_servidor_sem_horario()
    {
        using var f = new Fixture(_ => Ok());

        await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);

        var sent = Assert.Single(f.Api.Requests);
        Assert.Equal(HttpMethod.Post, sent.Method);
        Assert.Equal(new Uri("http://api.test/api/server/player-connects"), sent.Uri);
        Assert.Equal("Bearer chave-do-servidor", sent.Authorization);
        Assert.Equal("""{"steamId":"76561198000000001","steamName":"coldzera"}""", sent.Body);
    }

    [Fact]
    public async Task Com_a_API_fora_guarda_o_connect_e_o_jogador_segue_com_o_nome_Steam()
    {
        using var f = new Fixture(ApiDown);

        var outcome = await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);

        Assert.IsType<ConnectOutcome.Queued>(outcome);
        Assert.Equal([new PendingConnect(SteamId, "coldzera", Now)], f.Pending.Snapshot());
    }

    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    public async Task Guarda_o_connect_quando_a_API_responde_com_erro_que_pode_passar(HttpStatusCode status)
    {
        using var f = new Fixture(_ => StubHandler.Json(status, "{}"));

        var outcome = await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);

        Assert.IsType<ConnectOutcome.Queued>(outcome);
        Assert.Equal(1, f.Pending.Count);
    }

    [Fact]
    public async Task Nao_guarda_um_connect_que_a_API_recusou_por_dados_invalidos()
    {
        using var f = new Fixture(_ => StubHandler.Json(HttpStatusCode.BadRequest, """{"message":"steamId inválido"}"""));

        var outcome = await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);

        Assert.IsType<ConnectOutcome.Rejected>(outcome);
        Assert.Equal(0, f.Pending.Count);
    }

    [Fact]
    public async Task Ao_religar_a_API_reenvia_os_connects_guardados_com_o_horario_original()
    {
        using var f = new Fixture(ApiDown);
        await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);
        f.Time.Advance(TimeSpan.FromMinutes(3));
        await f.Sync.ConnectAsync(OtherSteamId, "fallen", TestContext.Current.CancellationToken);

        f.Api.Respond = sent => sent.Body.Contains("fallen", StringComparison.Ordinal) ? Ok(10_020, "fallen") : Ok();
        var result = await f.Sync.FlushPendingAsync(TestContext.Current.CancellationToken);

        Assert.Equal([SteamId, OtherSteamId], result.Replayed.Select(r => r.SteamId));
        Assert.True(result.Replayed[0].Result.IsFirstConnect);
        Assert.Equal(0, f.Pending.Count);
        var replayedBodies = f.Api.Requests.Skip(2).Select(r => JsonDocument.Parse(r.Body).RootElement).ToList();
        Assert.Equal(Now, replayedBodies[0].GetProperty("connectedAt").GetDateTimeOffset());
        Assert.Equal(Now.AddMinutes(3), replayedBodies[1].GetProperty("connectedAt").GetDateTimeOffset());
    }

    [Fact]
    public async Task Para_de_reenviar_se_a_API_cair_de_novo_e_mantem_o_resto_na_fila()
    {
        using var f = new Fixture(ApiDown);
        await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);
        await f.Sync.ConnectAsync(OtherSteamId, "fallen", TestContext.Current.CancellationToken);

        var calls = 0;
        f.Api.Respond = sent => ++calls == 1 ? Ok() : throw new HttpRequestException("Connection refused");
        var result = await f.Sync.FlushPendingAsync(TestContext.Current.CancellationToken);

        Assert.Equal([SteamId], result.Replayed.Select(r => r.SteamId));
        Assert.Equal([OtherSteamId], f.Pending.Snapshot().Select(p => p.SteamId));
    }

    [Fact]
    public async Task Descarta_da_fila_um_connect_guardado_que_a_API_recusa()
    {
        using var f = new Fixture(ApiDown);
        await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);

        f.Api.Respond = _ => StubHandler.Json(HttpStatusCode.BadRequest, "{}");
        var result = await f.Sync.FlushPendingAsync(TestContext.Current.CancellationToken);

        Assert.Empty(result.Replayed);
        Assert.Single(result.Rejected);
        Assert.Equal(0, f.Pending.Count);
    }

    [Fact]
    public async Task Um_connect_ao_vivo_aceito_tira_da_fila_o_connect_antigo_do_mesmo_jogador()
    {
        using var f = new Fixture(ApiDown);
        await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);

        f.Api.Respond = _ => Ok();
        await f.Sync.ConnectAsync(SteamId, "coldzera", TestContext.Current.CancellationToken);

        Assert.Equal(0, f.Pending.Count);
    }
}
