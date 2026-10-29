using System.Net;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class AwpDefaultTests
{
    private const ulong Player = 76561198000000001;

    [Fact]
    public void O_comando_so_liga_a_preferencia_e_nao_alterna()
    {
        // css_awp alterna (tira a AWP de quem já ligou); css_gun awp só liga.
        Assert.Equal("css_gun awp", AwpDefault.Command);
    }

    [Fact]
    public async Task Guarda_a_marca_na_API_com_a_chave_do_servidor()
    {
        using var api = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.NoContent));
        var awp = new AwpDefault(CarmineApi.CreateClient(StubHandler.Options, api));

        Assert.True(await awp.MarkAppliedAsync(Player, CancellationToken.None));

        var sent = Assert.Single(api.Requests);
        Assert.Equal(HttpMethod.Post, sent.Method);
        Assert.Equal(new Uri($"http://api.test/api/server/players/{Player}/awp-default"), sent.Uri);
        Assert.Equal("Bearer chave-do-servidor", sent.Authorization);
    }

    [Fact]
    public async Task Com_a_API_fora_nao_lanca_e_o_proximo_connect_repete()
    {
        using var api = new StubHandler(_ => throw new HttpRequestException("Connection refused"));
        var awp = new AwpDefault(CarmineApi.CreateClient(StubHandler.Options, api));

        Assert.False(await awp.MarkAppliedAsync(Player, CancellationToken.None));
    }

    [Fact]
    public async Task Conta_desconhecida_404_tambem_nao_lanca()
    {
        using var api = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        var awp = new AwpDefault(CarmineApi.CreateClient(StubHandler.Options, api));

        Assert.False(await awp.MarkAppliedAsync(Player, CancellationToken.None));
    }
}
