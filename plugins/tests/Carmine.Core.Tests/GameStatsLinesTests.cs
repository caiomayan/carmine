using System.Net;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class GameStatsLinesTests
{
    private const ulong Player = 76561198000000001;

    private static (GameStatsLines Lines, StubHandler Api) Make(Func<SentRequest, HttpResponseMessage> respond)
    {
        var api = new StubHandler(respond);
        return (new GameStatsLines(CarmineApi.CreateClient(StubHandler.Options, api)), api);
    }

    [Fact]
    public async Task O_rank_devolve_a_linha_da_API_pronta()
    {
        var (lines, api) = Make(_ => StubHandler.Json(HttpStatusCode.OK, """{"message":"Retake: 8º da semana · 412 rounds vencidos."}"""));
        using var _ = api;

        var message = await lines.RankAsync(Player, CancellationToken.None);

        Assert.Equal("Retake: 8º da semana · 412 rounds vencidos.", message);
        var sent = Assert.Single(api.Requests);
        Assert.Equal(HttpMethod.Get, sent.Method);
        Assert.Equal(new Uri($"http://api.test/api/server/players/{Player}/rank"), sent.Uri);
    }

    [Fact]
    public async Task O_stats_pede_o_endpoint_de_stats()
    {
        var (lines, api) = Make(_ => StubHandler.Json(HttpStatusCode.OK, """{"message":"Retake na semana: K/D 1,50"}"""));
        using var _ = api;

        await lines.StatsAsync(Player, CancellationToken.None);

        Assert.Equal(new Uri($"http://api.test/api/server/players/{Player}/stats"), Assert.Single(api.Requests).Uri);
    }

    [Fact]
    public async Task Com_a_API_fora_ou_Conta_desconhecida_diz_onde_ver_no_site()
    {
        var (down, apiDown) = Make(_ => throw new HttpRequestException("Connection refused"));
        var (missing, apiMissing) = Make(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        using var _1 = apiDown;
        using var _2 = apiMissing;

        Assert.Equal(GameStatsLines.UnavailableMessage, await down.RankAsync(Player, CancellationToken.None));
        Assert.Equal(GameStatsLines.UnavailableMessage, await missing.StatsAsync(Player, CancellationToken.None));
    }
}
