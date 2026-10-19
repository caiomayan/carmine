using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class ChatLogTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 19, 18, 0, 0, TimeSpan.Zero);

    private static readonly PlayerRef Ana = new(76561198000000001, false, GameTeam.Ct);
    private static readonly PlayerRef Bia = new(76561198000000002, false, GameTeam.T);
    private static readonly PlayerRef Espectador = new(76561198000000003, false, null);
    private static readonly PlayerRef Bot = new(0, true, GameTeam.T);

    private sealed class Fixture : IDisposable
    {
        public FakeTimeProvider Time { get; } = new(Now);
        public StubHandler Api { get; } = new(_ => throw new InvalidOperationException("sem rede"));
        public EventReporter Reporter { get; }
        public EventRecorder Recorder { get; }

        public Fixture()
        {
            Reporter = new EventReporter(CarmineApi.CreateClient(StubHandler.Options, Api), Time);
            Recorder = new EventRecorder(Reporter, Time);
        }

        public void Dispose() => Api.Dispose();
    }

    [Fact]
    public void A_mensagem_vai_para_o_log_com_o_lado_o_chat_de_time_e_um_ID_proprio()
    {
        using var f = new Fixture();

        f.Recorder.Chat(Ana, teamChat: false, "boa rodada");
        f.Recorder.Chat(Bia, teamChat: true, "  rush B  ");
        f.Recorder.Chat(Espectador, teamChat: false, "olá");

        var lines = f.Reporter.Snapshot().ChatMessages!;
        Assert.Equal(["boa rodada", "rush B", "olá"], lines.Select(l => l.Text));
        Assert.Equal([ChatTeam.Ct, ChatTeam.T, ChatTeam.Spectator], lines.Select(l => l.Team));
        Assert.Equal([false, true, false], lines.Select(l => l.TeamChat));
        Assert.All(lines, l =>
        {
            Assert.Equal(Now, l.At);
            Assert.Equal(7, l.Id.Version);
        });
        Assert.Equal(3, lines.Select(l => l.Id).Distinct().Count());
        Assert.Equal("76561198000000001", lines.First().SteamId);
    }

    [Fact]
    public void Bot_nao_entra_no_log()
    {
        using var f = new Fixture();

        f.Recorder.Chat(Bot, teamChat: false, "sou um bot");

        Assert.Null(f.Reporter.Snapshot().ChatMessages);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("/algo silencioso")]
    [InlineData("!report")]
    [InlineData("!report 3")]
    [InlineData("!REPORT 3")]
    [InlineData("!denunciar 2")]
    [InlineData("!chat off")]
    public void Vazio_comando_silencioso_e_comandos_do_Carmine_ficam_de_fora(string? text)
    {
        Assert.Null(ChatLogFilter.Clean(text));
    }

    [Theory]
    [InlineData("!ws")]
    [InlineData("!rtv")]
    [InlineData("!reportar")]
    [InlineData("!idiota")]
    public void Outros_comandos_com_exclamacao_sao_chat_visivel_e_ficam_no_log(string text)
    {
        Assert.Equal(text, ChatLogFilter.Clean(text));
    }

    [Fact]
    public void Mensagem_longa_e_cortada_no_limite_do_contrato_sem_partir_um_par_substituto()
    {
        var text = new string('a', ChatLogFilter.MaxLength - 1) + "😀";

        var clean = ChatLogFilter.Clean(text)!;

        Assert.Equal(ChatLogFilter.MaxLength - 1, clean.Length);
        Assert.True(clean.All(c => c == 'a'));
        Assert.Equal(ChatLogFilter.MaxLength, ChatLogFilter.Clean(new string('b', 500))!.Length);
    }

    [Fact]
    public async Task O_chat_sai_no_mesmo_lote_dos_outros_eventos()
    {
        using var f = new Fixture();
        f.Api.Respond = _ => StubHandler.Json(System.Net.HttpStatusCode.OK, """{"accepted":1,"duplicates":0,"ignored":0}""");
        f.Recorder.Chat(Ana, false, "gg");

        var report = await f.Reporter.FlushAsync(TestContext.Current.CancellationToken);

        Assert.Equal(1, report.Sent);
        var body = Assert.Single(f.Api.Requests).Body;
        Assert.Contains("\"chatMessages\":[{", body, StringComparison.Ordinal);
        Assert.Contains("\"text\":\"gg\"", body, StringComparison.Ordinal);
        Assert.Contains("\"team\":\"ct\"", body, StringComparison.Ordinal);
    }
}
