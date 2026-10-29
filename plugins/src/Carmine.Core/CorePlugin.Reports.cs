using Carmine.Api.Client;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Commands;

namespace Carmine.Core;

/// <summary>
/// <c>!report</c> (S13): o jogador escolhe quem e por quê num menu em chat numerado
/// (<see cref="ReportDialog"/>) e a Denúncia vai à API (<see cref="ReportSender"/>), que aplica os
/// limites e responde o texto do chat. O jogador nunca vê a si mesmo nem bots na lista.
/// </summary>
public sealed partial class CorePlugin
{
    private ReportDialog? _reportDialog;
    private ReportSender? _reportSender;

    private void LoadReports(ICarmineApiClient client)
    {
        if (_events is not { } events)
        {
            return;
        }
        _reportDialog = new ReportDialog(TimeProvider.System);
        _reportSender = new ReportSender(client, events);
        AddCommand("css_report", "!report denuncia um jogador à Staff (cheat, voz, chat ofensivo, antijogo)", OnReportCommand);
        AddCommand("css_denunciar", "!denunciar é o mesmo que !report", OnReportCommand);
    }

    /// <summary><c>!report</c> abre o menu; <c>!report &lt;número&gt;</c> escolhe o jogador e depois o motivo.</summary>
    private void OnReportCommand(CCSPlayerController? player, CommandInfo info)
    {
        if (player is null || !IsHuman(player) || _reportDialog is not { } dialog || _reportSender is not { } sender)
        {
            return;
        }
        var reporter = player.SteamID;
        var argument = info.GetArg(1).Trim();
        var step = argument.Length == 0
            ? dialog.Start(
                reporter,
                [.. Utilities.GetPlayers()
                    .Where(p => IsHuman(p) && p.SteamID != reporter && p.Connected == PlayerConnectedState.Connected)
                    .Select(p => new ReportCandidate(p.SteamID, p.PlayerName))])
            : dialog.Choose(reporter, argument);

        switch (step)
        {
            case ReportStep.Say say:
                foreach (var line in say.Lines)
                {
                    player.SendChat(line);
                }
                break;
            case ReportStep.Submit submit:
                var round = ReportRound.InProgress(GameRules()?.TotalRoundsPlayed, IsWarmup());
                var map = Server.MapName;
                RunInBackground(async token =>
                {
                    var outcome = await sender.SendAsync(reporter, submit.Target.SteamId, submit.Reason, round, map, token);
                    Log.ReportSent(Logger, reporter, submit.Target.SteamId, submit.Reason, outcome.Accepted);
                    Server.NextFrame(() =>
                    {
                        var current = Utilities.GetPlayers().FirstOrDefault(p => IsHuman(p) && p.SteamID == reporter);
                        current?.SendChat(outcome.Message);
                    });
                });
                break;
        }
    }
}
