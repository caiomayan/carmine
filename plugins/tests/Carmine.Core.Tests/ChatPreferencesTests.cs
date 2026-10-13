using System.Net;
using Carmine.Api.Client;
using Xunit;

namespace Carmine.Core.Tests;

public class ChatPreferencesTests
{
    private const ulong Player = 76561198000000001;
    private const ulong Other = 76561198000000002;
    private const ulong Third = 76561198000000003;

    private static HttpResponseMessage Saved(SentRequest _) => new(HttpStatusCode.NoContent);

    private static HttpResponseMessage ApiDown(SentRequest _) => throw new HttpRequestException("Connection refused");

    private sealed class Fixture : IDisposable
    {
        public StubHandler Api { get; }
        public ChatPreferences Chat { get; }

        public Fixture(Func<SentRequest, HttpResponseMessage> respond)
        {
            Api = new StubHandler(respond);
            Chat = new ChatPreferences(CarmineApi.CreateClient(StubHandler.Options, Api));
        }

        public void Dispose() => Api.Dispose();
    }

    [Theory]
    [InlineData("off", false)]
    [InlineData(" OFF ", false)]
    [InlineData("on", true)]
    [InlineData("On", true)]
    public void Entende_o_off_e_o_on(string argument, bool visible)
    {
        Assert.Equal(visible ? ChatToggle.Show : ChatToggle.Hide, ChatPreferences.Parse(argument));
    }

    [Theory]
    [InlineData("")]
    [InlineData("desligar")]
    public void Outro_argumento_nao_e_um_comando_valido(string argument)
    {
        Assert.Null(ChatPreferences.Parse(argument));
    }

    [Fact]
    public void O_padrao_e_o_chat_visivel()
    {
        using var f = new Fixture(Saved);

        Assert.False(f.Chat.IsHidden(Player));
        Assert.Empty(f.Chat.HiddenFrom(Other, [Player, Other, Third]));
    }

    [Fact]
    public void Quem_ocultou_nao_recebe_o_chat_dos_outros_mas_ve_o_proprio()
    {
        using var f = new Fixture(Saved);
        f.Chat.OnConnectResult(Player, chatHidden: true);

        Assert.Equal([Player], f.Chat.HiddenFrom(Other, [Player, Other, Third]));
        Assert.Empty(f.Chat.HiddenFrom(Player, [Player, Other, Third]));
        // Mensagem sem autor conhecido (do servidor): continua chegando.
        Assert.Empty(f.Chat.HiddenFrom(0, [Player, Other]));
    }

    [Fact]
    public async Task Off_vale_na_hora_e_grava_na_API_para_os_proximos_connects()
    {
        using var f = new Fixture(Saved);

        var result = await f.Chat.SetAsync(Player, ChatToggle.Hide, TestContext.Current.CancellationToken);

        Assert.True(f.Chat.IsHidden(Player));
        Assert.Equal(ChatPreferences.HiddenMessage, result.Message);
        Assert.True(result.Saved);
        var sent = Assert.Single(f.Api.Requests);
        Assert.Equal(HttpMethod.Put, sent.Method);
        Assert.Equal(new Uri($"http://api.test/api/server/players/{Player}/chat-preference"), sent.Uri);
        Assert.Equal("Bearer chave-do-servidor", sent.Authorization);
        Assert.Equal("""{"hidden":true}""", sent.Body);
    }

    [Fact]
    public async Task Com_a_API_fora_vale_so_ate_sair_e_o_jogador_e_avisado()
    {
        using var f = new Fixture(ApiDown);
        f.Chat.OnConnectResult(Player, chatHidden: true);

        var result = await f.Chat.SetAsync(Player, ChatToggle.Show, TestContext.Current.CancellationToken);

        Assert.False(f.Chat.IsHidden(Player));
        Assert.False(result.Saved);
        Assert.Equal($"{ChatPreferences.VisibleMessage} {ChatPreferences.NotSavedNotice}", result.Message);
    }

    [Fact]
    public void Lembra_no_primeiro_spawn_de_quem_entrou_com_o_chat_oculto()
    {
        using var f = new Fixture(Saved);
        f.Chat.OnConnectResult(Player, chatHidden: true);
        f.Chat.OnConnectResult(Other, chatHidden: false);

        Assert.True(f.Chat.TakeReminderOnSpawn(Player));
        Assert.False(f.Chat.TakeReminderOnSpawn(Player));
        Assert.False(f.Chat.TakeReminderOnSpawn(Other));
    }

    [Fact]
    public void Sair_do_servidor_esquece_a_preferencia_ate_o_proximo_connect()
    {
        using var f = new Fixture(Saved);
        f.Chat.OnConnectResult(Player, chatHidden: true);

        f.Chat.OnDisconnect(Player);

        Assert.False(f.Chat.IsHidden(Player));
        Assert.False(f.Chat.TakeReminderOnSpawn(Player));
    }
}
