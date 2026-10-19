using Carmine.Api.Client;
using Microsoft.Extensions.Time.Testing;
using Xunit;

namespace Carmine.Core.Tests;

public class ReportDialogTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 19, 18, 0, 0, TimeSpan.Zero);
    private const ulong Reporter = 76561198000000001;

    private static readonly ReportCandidate Bia = new(76561198000000002, "Bia");
    private static readonly ReportCandidate Caio = new(76561198000000003, "Caio");

    private static IReadOnlyList<string> Lines(ReportStep step) => Assert.IsType<ReportStep.Say>(step).Lines;

    [Fact]
    public void Start_lista_os_jogadores_numerados()
    {
        var dialog = new ReportDialog(new FakeTimeProvider(Now));

        var lines = Lines(dialog.Start(Reporter, [Bia, Caio]));

        Assert.Equal(["Denunciar quem? Digite !report <número>:", "1. Bia", "2. Caio"], lines);
    }

    [Fact]
    public void Sem_outros_jogadores_nao_ha_o_que_denunciar()
    {
        var dialog = new ReportDialog(new FakeTimeProvider(Now));

        Assert.Equal([ReportDialog.NoPlayers], Lines(dialog.Start(Reporter, [])));
        Assert.Equal([ReportDialog.NothingOpen], Lines(dialog.Choose(Reporter, "1")));
    }

    [Fact]
    public void Escolhido_o_jogador_lista_os_motivos_e_escolhido_o_motivo_envia()
    {
        var dialog = new ReportDialog(new FakeTimeProvider(Now));
        dialog.Start(Reporter, [Bia, Caio]);

        var reasons = Lines(dialog.Choose(Reporter, "2"));
        Assert.Equal(
            ["Motivo da denúncia de Caio? Digite !report <número>:", "1. Cheat", "2. Voz ofensiva", "3. Chat ofensivo", "4. Antijogo", "5. Outro"],
            reasons);

        var submit = Assert.IsType<ReportStep.Submit>(dialog.Choose(Reporter, "3"));
        Assert.Equal(Caio, submit.Target);
        Assert.Equal(ReportReason.Offensive_chat, submit.Reason);
        Assert.Equal([ReportDialog.NothingOpen], Lines(dialog.Choose(Reporter, "1")));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("3")]
    [InlineData("-1")]
    [InlineData("abc")]
    [InlineData("1x")]
    public void Numero_invalido_mantem_o_dialogo_e_pede_um_valido(string argument)
    {
        var dialog = new ReportDialog(new FakeTimeProvider(Now));
        dialog.Start(Reporter, [Bia, Caio]);

        Assert.Equal(["Número inválido: escolha de 1 a 2."], Lines(dialog.Choose(Reporter, argument)));
        Assert.IsType<ReportStep.Say>(dialog.Choose(Reporter, "1"));
    }

    [Fact]
    public void O_dialogo_expira_sem_resposta_e_cada_resposta_renova_o_prazo()
    {
        var time = new FakeTimeProvider(Now);
        var dialog = new ReportDialog(time);
        dialog.Start(Reporter, [Bia]);
        time.Advance(ReportDialog.Timeout - TimeSpan.FromSeconds(1));
        dialog.Choose(Reporter, "1");

        time.Advance(ReportDialog.Timeout - TimeSpan.FromSeconds(1));
        Assert.IsType<ReportStep.Submit>(dialog.Choose(Reporter, "1"));

        dialog.Start(Reporter, [Bia]);
        time.Advance(ReportDialog.Timeout);
        Assert.Equal([ReportDialog.Expired], Lines(dialog.Choose(Reporter, "1")));
    }

    [Fact]
    public void Cada_jogador_tem_o_seu_dialogo_e_sair_o_apaga()
    {
        var dialog = new ReportDialog(new FakeTimeProvider(Now));
        dialog.Start(Reporter, [Bia]);
        dialog.Start(Bia.SteamId, [Caio]);

        dialog.Forget(Reporter);

        Assert.Equal([ReportDialog.NothingOpen], Lines(dialog.Choose(Reporter, "1")));
        Assert.Equal("Motivo da denúncia de Caio? Digite !report <número>:", Lines(dialog.Choose(Bia.SteamId, "1"))[0]);
    }

    [Fact]
    public void Recomecar_troca_a_lista_pela_atual()
    {
        var dialog = new ReportDialog(new FakeTimeProvider(Now));
        dialog.Start(Reporter, [Bia]);
        dialog.Choose(Reporter, "1");

        dialog.Start(Reporter, [Caio]);

        Assert.Equal("Motivo da denúncia de Caio? Digite !report <número>:", Lines(dialog.Choose(Reporter, "1"))[0]);
    }
}
