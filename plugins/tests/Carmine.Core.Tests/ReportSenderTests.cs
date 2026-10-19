using System.Net;
using System.Text.Json;
using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class ReportSenderTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 19, 18, 0, 0, TimeSpan.Zero);

    private const ulong Reporter = 76561198000000001;
    private const ulong Target = 76561198000000002;

    private static bool IsReport(SentRequest request) => request.Uri?.AbsolutePath == "/api/server/reports";

    private sealed class Fixture : IDisposable
    {
        public StubHandler Api { get; }
        public EventReporter Events { get; }
        public ReportSender Sender { get; }

        public Fixture(Func<SentRequest, HttpResponseMessage> respond)
        {
            Api = new StubHandler(respond);
            var client = CarmineApi.CreateClient(StubHandler.Options, Api);
            Events = new EventReporter(client, new FakeTimeProvider(Now));
            Sender = new ReportSender(client, Events);
        }

        public void Dispose() => Api.Dispose();
    }

    private static HttpResponseMessage Respond(SentRequest request) =>
        IsReport(request)
            ? StubHandler.Json(HttpStatusCode.OK, """{"accepted":true,"message":"Denúncia recebida; a Staff analisa em até 72 h.","refusal":null,"retryAfterSeconds":null}""")
            : StubHandler.Json(HttpStatusCode.OK, """{"accepted":1,"duplicates":0,"ignored":0}""");

    [Fact]
    public async Task Manda_primeiro_o_chat_da_fila_e_depois_a_Denuncia_com_alvo_motivo_round_e_mapa()
    {
        using var f = new Fixture(Respond);
        f.Events.Add(new ChatMessageEvent
        {
            Id = Guid.CreateVersion7(Now),
            At = Now,
            SteamId = Target.ToString(System.Globalization.CultureInfo.InvariantCulture),
            Team = ChatTeam.T,
            TeamChat = false,
            Text = "seu lixo",
        });

        var outcome = await f.Sender.SendAsync(Reporter, Target, ReportReason.Offensive_chat, 7, "de_nuke", TestContext.Current.CancellationToken);

        Assert.True(outcome.Accepted);
        Assert.Equal("Denúncia recebida; a Staff analisa em até 72 h.", outcome.Message);
        Assert.Equal(["/api/server/events", "/api/server/reports"], f.Api.Requests.Select(r => r.Uri!.AbsolutePath));
        Assert.Contains("seu lixo", f.Api.Requests[0].Body, StringComparison.Ordinal);
        var report = JsonDocument.Parse(f.Api.Requests[1].Body).RootElement;
        Assert.Equal("76561198000000001", report.GetProperty("reporterSteamId").GetString());
        Assert.Equal("76561198000000002", report.GetProperty("targetSteamId").GetString());
        Assert.Equal("offensive_chat", report.GetProperty("reason").GetString());
        Assert.Equal(7, report.GetProperty("round").GetInt32());
        Assert.Equal("de_nuke", report.GetProperty("map").GetString());
        Assert.Equal("Bearer chave-do-servidor", f.Api.Requests[1].Authorization);
    }

    [Fact]
    public async Task A_recusa_da_API_chega_ao_jogador_com_a_mensagem_dela()
    {
        using var f = new Fixture(request => IsReport(request)
            ? StubHandler.Json(HttpStatusCode.OK, """{"accepted":false,"message":"Você já denunciou este jogador há pouco. Tente de novo em 6 min.","refusal":"same_target_cooldown","retryAfterSeconds":360}""")
            : StubHandler.Json(HttpStatusCode.OK, """{"accepted":0,"duplicates":0,"ignored":0}"""));

        var outcome = await f.Sender.SendAsync(Reporter, Target, ReportReason.Cheat, null, null, TestContext.Current.CancellationToken);

        Assert.False(outcome.Accepted);
        Assert.Equal("Você já denunciou este jogador há pouco. Tente de novo em 6 min.", outcome.Message);
    }

    [Fact]
    public async Task Com_a_API_fora_o_jogador_ouve_que_nao_deu_e_nada_lanca()
    {
        using var f = new Fixture(_ => throw new HttpRequestException("Connection refused"));

        var outcome = await f.Sender.SendAsync(Reporter, Target, ReportReason.Griefing, 3, "de_mirage", TestContext.Current.CancellationToken);

        Assert.False(outcome.Accepted);
        Assert.Equal(ReportSender.UnavailableMessage, outcome.Message);
    }

    [Fact]
    public async Task Uma_API_que_recusa_o_corpo_tambem_nao_derruba()
    {
        using var f = new Fixture(request => IsReport(request)
            ? StubHandler.Json(HttpStatusCode.BadRequest, """{"statusCode":400,"message":"Corpo inválido"}""")
            : StubHandler.Json(HttpStatusCode.OK, """{"accepted":0,"duplicates":0,"ignored":0}"""));

        var outcome = await f.Sender.SendAsync(Reporter, Target, ReportReason.Other, null, null, TestContext.Current.CancellationToken);

        Assert.False(outcome.Accepted);
        Assert.Equal(ReportSender.UnavailableMessage, outcome.Message);
    }
}
