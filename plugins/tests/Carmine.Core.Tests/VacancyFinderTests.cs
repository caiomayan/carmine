using System.Net;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class VacancyFinderTests
{
    private static string Server(
        string name,
        string mode,
        string state,
        int players,
        int maxPlayers,
        string address,
        string? showcaseName = null,
        string? code = null) => $$"""
        {"id":"{{Guid.NewGuid()}}","name":"{{name}}","showcaseName":{{Quote(showcaseName)}},"code":{{Quote(code)}},
         "mode":"{{mode}}","address":"{{address}}","region":"sao-paulo","map":"de_mirage","players":{{players}},
         "maxPlayers":{{maxPlayers}},"state":"{{state}}","lastHeartbeatAt":null}
        """;

    private static string Quote(string? value) => value is null ? "null" : $"\"{value}\"";

    private static string List(params string[] servers) =>
        $$"""{"servers":[{{string.Join(",", servers)}}],"summary":{"online":1,"players":1},"generatedAt":"2026-10-13T20:00:00Z"}""";

    private static async Task<string?> FindAsync(string body, GameMode mode)
    {
        using var api = new StubHandler(_ => StubHandler.Json(HttpStatusCode.OK, body));
        var finder = new VacancyFinder(CarmineApi.CreateClient(StubHandler.Options, api));
        return await finder.FindAsync(mode, TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task Prefere_um_servidor_do_mesmo_Modo_com_vaga_com_nome_de_vitrine_codigo_e_endereco()
    {
        var body = List(
            Server("dm-1", "deathmatch", "online", 2, 16, "10.0.0.1:27016", "Deathmatch · Livre", "SP·2"),
            Server("retake-1", "retake", "full", 9, 9, "10.0.0.1:27015", "Retake · Rotação", "SP·1"),
            Server("retake-2", "retake", "online", 8, 9, "10.0.0.1:27017", "Retake · Mirage", "SP·3"));

        Assert.Equal("Retake · Mirage (SP·3), connect 10.0.0.1:27017", await FindAsync(body, GameMode.Retake));
    }

    [Fact]
    public async Task Sem_vaga_no_mesmo_Modo_indica_outro_Modo_e_usa_o_nome_curto_sem_vitrine()
    {
        var body = List(
            Server("retake-1", "retake", "full", 9, 9, "10.0.0.1:27015"),
            Server("dm-1", "deathmatch", "online", 2, 16, "10.0.0.1:27016"));

        Assert.Equal("dm-1, connect 10.0.0.1:27016", await FindAsync(body, GameMode.Retake));
    }

    [Fact]
    public async Task Entre_varios_com_vaga_escolhe_o_mais_vazio()
    {
        var body = List(
            Server("retake-2", "retake", "online", 7, 9, "10.0.0.1:27017"),
            Server("retake-3", "retake", "online", 2, 9, "10.0.0.1:27018"));

        Assert.Equal("retake-3, connect 10.0.0.1:27018", await FindAsync(body, GameMode.Retake));
    }

    [Fact]
    public async Task Nenhum_com_vaga_ou_todos_offline_da_nulo()
    {
        var body = List(
            Server("retake-1", "retake", "full", 9, 9, "10.0.0.1:27015"),
            Server("dm-1", "deathmatch", "offline", 0, 16, "10.0.0.1:27016"));

        Assert.Null(await FindAsync(body, GameMode.Retake));
    }

    [Fact]
    public async Task Com_a_API_fora_da_nulo_sem_lancar()
    {
        using var api = new StubHandler(_ => throw new HttpRequestException("Connection refused"));
        var finder = new VacancyFinder(CarmineApi.CreateClient(StubHandler.Options, api));

        Assert.Null(await finder.FindAsync(GameMode.Retake, TestContext.Current.CancellationToken));
    }
}
