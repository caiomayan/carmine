using Xunit;

namespace Carmine.Core.Tests;

public class ChatMessageTests
{
    [Fact]
    public void A_mensagem_comeca_com_Carmine_em_carmim_e_separa_o_texto_com_ponto_medio()
    {
        var line = ChatMessage.Format("Olá.");

        Assert.StartsWith(" \u0002Carmine\u0001 · Olá.", line);
    }

    [Fact]
    public void Um_texto_de_duas_linhas_vira_duas_mensagens_do_Carmine()
    {
        var lines = ChatMessage.FormatLines("Primeira.\nSegunda.").ToList();

        Assert.Equal(2, lines.Count);
        Assert.EndsWith(" · Primeira.", lines[0]);
        Assert.StartsWith(" \u0002Carmine\u0001 · Segunda.", lines[1]);
    }

    [Fact]
    public void Nenhuma_constante_do_Core_tem_exclamacao_de_propaganda_nem_caixa_alta()
    {
        string[] messages =
        [
            LoadoutNotices.Message, ChatPreferences.HiddenMessage, ChatPreferences.VisibleMessage,
            ChatPreferences.UsageMessage, ChatPreferences.ReminderMessage, VipInfo.NoStatusMessage,
            ReservedSlots.QueuedVipMessage, ReportDialog.NoPlayers, ReportDialog.NothingOpen,
            ReportDialog.Expired, ReportSender.UnavailableMessage,
        ];

        foreach (var message in messages)
        {
            Assert.DoesNotContain('!', message.Replace("!chat", "").Replace("!ws", "").Replace("!report", ""));
            Assert.NotEqual(message.ToUpperInvariant(), message);
        }
    }
}
