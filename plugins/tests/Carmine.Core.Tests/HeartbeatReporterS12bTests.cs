using System.Net;
using System.Text.Json;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class HeartbeatReporterS12bTests
{
    private const string A = "76561198000000001";
    private const string B = "76561198000000002";

    private static HttpResponseMessage Ok(SentRequest _) =>
        StubHandler.Json(HttpStatusCode.OK, """{"hostname":null,"sanctions":[]}""");

    private static async Task<JsonElement> SentBodyAsync(ServerSnapshot snapshot)
    {
        using var api = new StubHandler(Ok);
        var reporter = new HeartbeatReporter(CarmineApi.CreateClient(StubHandler.Options, api));
        await reporter.SendAsync(snapshot, TestContext.Current.CancellationToken);
        return JsonDocument.Parse(Assert.Single(api.Requests).Body).RootElement.Clone();
    }

    [Fact]
    public async Task Retake_manda_o_placar_de_times_e_o_placar_por_jogador()
    {
        var body = await SentBodyAsync(new ServerSnapshot(
            "de_mirage",
            [76561198000000001, 76561198000000002],
            MaxPlayers: 9,
            Match: new MatchSnapshot(Round: 15, CtScore: 8, TScore: 6, Warmup: false),
            Scoreboard:
            [
                new ScoreboardRow(76561198000000001, GameTeam.Ct, Kills: 12, Deaths: 5, Score: 31),
                new ScoreboardRow(76561198000000002, GameTeam.T, 3, 9, 7),
            ]));

        var match = body.GetProperty("match");
        Assert.Equal(15, match.GetProperty("round").GetInt32());
        Assert.Equal(8, match.GetProperty("ctScore").GetInt32());
        Assert.Equal(6, match.GetProperty("tScore").GetInt32());
        Assert.False(match.GetProperty("warmup").GetBoolean());
        var rows = body.GetProperty("scoreboard").EnumerateArray().ToList();
        Assert.Equal([A, B], rows.Select(r => r.GetProperty("steamId").GetString()));
        Assert.Equal(["ct", "t"], rows.Select(r => r.GetProperty("team").GetString()));
        Assert.Equal(12, rows[0].GetProperty("kills").GetInt32());
        Assert.Equal(9, rows[1].GetProperty("deaths").GetInt32());
        Assert.Equal(31, rows[0].GetProperty("score").GetInt32());
    }

    [Fact]
    public async Task Deathmatch_sem_placar_de_times_nao_manda_match_e_o_time_de_cada_um_vai_vazio()
    {
        var body = await SentBodyAsync(new ServerSnapshot(
            "de_dust2",
            [76561198000000001],
            MaxPlayers: 20,
            Match: null,
            Scoreboard: [new ScoreboardRow(76561198000000001, null, 20, 11, 20)]));

        Assert.False(body.TryGetProperty("match", out _));
        var row = Assert.Single(body.GetProperty("scoreboard").EnumerateArray());
        Assert.Equal(20, row.GetProperty("kills").GetInt32());
        // O contrato aceita o time ausente (vira nulo na API): o C# omite o que é nulo.
        Assert.True(!row.TryGetProperty("team", out var team) || team.ValueKind == JsonValueKind.Null);
    }

    [Fact]
    public async Task Sem_placar_o_batimento_e_o_de_sempre_byte_a_byte()
    {
        using var api = new StubHandler(Ok);
        var reporter = new HeartbeatReporter(CarmineApi.CreateClient(StubHandler.Options, api));

        await reporter.SendAsync(
            new ServerSnapshot("de_mirage", [76561198000000001], MaxPlayers: 9),
            TestContext.Current.CancellationToken);

        Assert.Equal(
            """{"map":"de_mirage","players":["76561198000000001"],"maxPlayers":9}""",
            Assert.Single(api.Requests).Body);
    }

    [Fact]
    public async Task Aquecimento_vai_marcado_no_placar()
    {
        var body = await SentBodyAsync(new ServerSnapshot(
            "de_mirage",
            [],
            MaxPlayers: 9,
            Match: new MatchSnapshot(1, 0, 0, Warmup: true)));

        Assert.True(body.GetProperty("match").GetProperty("warmup").GetBoolean());
    }
}
