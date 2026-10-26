using Carmine.Api.Client;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace Carmine.Core;

/// <summary>
/// Eventos do jogo para as Estatísticas (S12, ADR 0018): kill, dano, fim de round e Sessão de
/// jogo viram eventos na fila (<see cref="EventRecorder"/>) e saem para a API de outra thread
/// (<see cref="EventReporter"/>), a cada <see cref="CoreConfig.EventFlushIntervalSeconds"/>, no
/// fim do mapa e ao descarregar. A API fora do ar não trava o jogo: os eventos esperam na fila.
/// </summary>
public sealed partial class CorePlugin
{
    /// <summary>Tempo máximo que o descarregamento espera o último envio.</summary>
    private static readonly TimeSpan FinalFlushTimeout = TimeSpan.FromSeconds(3);

    private EventReporter? _events;
    private EventRecorder? _recorder;
    private MatchTracker? _match;
    private CCSGameRules? _gameRules;

    private void LoadEvents(ICarmineApiClient client, bool hotReload)
    {
        _events = new EventReporter(client, TimeProvider.System, Config.EventQueueLimit);
        _match = new MatchTracker();
        _recorder = new EventRecorder(_events, TimeProvider.System, _match);

        RegisterEventHandler<EventPlayerDeath>(OnPlayerDeath);
        RegisterEventHandler<EventPlayerHurt>(OnPlayerHurt);
        RegisterEventHandler<EventRoundStart>(OnRoundStartEvents);
        RegisterEventHandler<EventRoundEnd>(OnRoundEndEvents);
        RegisterListener<Listeners.OnMapEnd>(FlushEvents);
        RegisterListener<Listeners.OnMapStart>(OnMapStartEvents);
        RegisterEventHandler<EventBeginNewMatch>(OnBeginNewMatch);
        AddTimer(Config.EventFlushIntervalSeconds, FlushEvents, TimerFlags.REPEAT);

        if (hotReload)
        {
            // A partida já está andando: parte do que o jogo já contou, em vez de zero.
            _recorder.MapStarted(Server.MapName);
            if (ReadGameScore() is { } game)
            {
                _match.Adopt(game);
            }
            foreach (var player in Utilities.GetPlayers().Where(IsHuman))
            {
                _recorder.PlayerJoined(player.SteamID);
            }
            _recorder.RoundStarted(Utilities.GetPlayers().Select(PlayerRefOf).OfType<PlayerRef>());
        }
    }

    /// <summary>
    /// Fecha as Sessões abertas e tenta o último envio, esperando pouco: o jogo não fica preso
    /// numa API fora do ar. O que não saiu se perde com a fila.
    /// </summary>
    private void UnloadEvents()
    {
        _recorder?.CloseAllSessions();
        if (_events is { Count: > 0 } events)
        {
            using var timeout = new CancellationTokenSource(FinalFlushTimeout);
            try
            {
                var report = events.FlushAsync(final: true, timeout.Token).GetAwaiter().GetResult();
                LogEventsReport(report);
            }
            catch (OperationCanceledException)
            {
                // A API não respondeu a tempo.
            }
            if (events.Count > 0)
            {
                Log.EventsLeftBehind(Logger, events.Count);
            }
        }
        _recorder = null;
        _match = null;
        _events = null;
    }

    private void FlushEvents()
    {
        if (_events is { Count: > 0 } events)
        {
            RunInBackground(async token => LogEventsReport(await events.FlushAsync(token)));
        }
    }

    private void LogEventsReport(EventFlushReport report)
    {
        if (report.WentDown is { } reason)
        {
            Log.EventsDown(Logger, reason);
        }
        if (report.CameBack)
        {
            Log.EventsBack(Logger);
        }
        if (report.Rejected is { } rejected)
        {
            Log.EventsRejected(Logger, rejected);
        }
        if (report.Dropped > 0)
        {
            Log.EventsDropped(Logger, report.Dropped);
        }
    }

    private HookResult OnPlayerDeath(EventPlayerDeath @event, GameEventInfo info)
    {
        if (_recorder is { } recorder && PlayerRefOf(@event.Userid) is { } victim)
        {
            recorder.Kill(
                PlayerRefOf(@event.Attacker),
                victim,
                PlayerRefOf(@event.Assister),
                @event.Headshot,
                @event.Weapon,
                IsWarmup(),
                TeammatesAreEnemies());
        }
        return HookResult.Continue;
    }

    private HookResult OnPlayerHurt(EventPlayerHurt @event, GameEventInfo info)
    {
        if (_recorder is { } recorder
            && PlayerRefOf(@event.Attacker) is { } attacker
            && PlayerRefOf(@event.Userid) is { } victim)
        {
            recorder.Damage(attacker, victim, @event.DmgHealth, IsWarmup(), TeammatesAreEnemies());
        }
        return HookResult.Continue;
    }

    private HookResult OnRoundStartEvents(EventRoundStart @event, GameEventInfo info)
    {
        ReconcileMatch();
        _recorder?.RoundStarted(Utilities.GetPlayers().Select(PlayerRefOf).OfType<PlayerRef>());
        return HookResult.Continue;
    }

    private HookResult OnRoundEndEvents(EventRoundEnd @event, GameEventInfo info)
    {
        var winner = (CsTeam)@event.Winner switch
        {
            CsTeam.CounterTerrorist => RoundWinner.Ct,
            CsTeam.Terrorist => RoundWinner.T,
            _ => RoundWinner.None,
        };
        _recorder?.RoundEnded(winner, IsWarmup(), TeammatesAreEnemies());
        // O placar novo vai no batimento logo, sem esperar os 10 s.
        ScheduleHeartbeat();
        return HookResult.Continue;
    }

    /// <summary>Mapa novo: a contagem de rounds recomeça e as Sessões abertas passam a incluir o mapa.</summary>
    private void OnMapStartEvents(string mapName)
    {
        _match?.Reset();
        _recorder?.MapStarted(mapName);
    }

    /// <summary>A partida recomeçou no mesmo mapa (<c>mp_restartgame</c>, fim do aquecimento): o placar volta a zero.</summary>
    private HookResult OnBeginNewMatch(EventBeginNewMatch @event, GameEventInfo info)
    {
        _match?.Reset();
        ScheduleHeartbeat();
        return HookResult.Continue;
    }

    /// <summary>
    /// Confere a contagem de rounds do plugin com a do jogo no começo de um round de verdade. O
    /// jogo é a fonte secundária: só detecta partida reiniciada e avisa se divergir (a contagem do
    /// plugin segue valendo; ver <see cref="MatchTracker"/>).
    /// </summary>
    private void ReconcileMatch()
    {
        if (_match is not { } match || TeammatesAreEnemies())
        {
            return;
        }
        switch (match.Reconcile(ReadGameScore(), IsWarmup()))
        {
            case ReconcileOutcome.Restarted:
                Log.MatchRestarted(Logger);
                break;
            case ReconcileOutcome.Diverged:
                var game = ReadGameScore();
                Log.MatchDiverged(Logger, match.RoundsPlayed, match.CtScore, match.TScore, game?.RoundsPlayed ?? -1, game?.CtScore ?? -1, game?.TScore ?? -1);
                break;
        }
    }

    /// <summary>O placar de times e o round em andamento para o batimento; nulo onde não há placar de times (Deathmatch).</summary>
    private MatchSnapshot? MatchForHeartbeat() =>
        _match is { } match && !TeammatesAreEnemies() ? match.Snapshot(IsWarmup()) : null;

    /// <summary>O placar por jogador, como no jogo. No Deathmatch ninguém tem time.</summary>
    private static List<ScoreboardRow> ScoreboardRows(IEnumerable<CCSPlayerController> players)
    {
        var noTeams = TeammatesAreEnemies();
        return
        [
            .. players.Select(player =>
            {
                var stats = player.ActionTrackingServices?.MatchStats;
                return new ScoreboardRow(
                    player.SteamID,
                    noTeams ? null : PlayerRefOf(player)?.Team,
                    stats?.Kills ?? 0,
                    stats?.Deaths ?? 0,
                    player.Score);
            }),
        ];
    }

    /// <summary>O que o jogo diz do placar; nulo se algo não está pronto (o jogo ainda subindo).</summary>
    private GameScore? ReadGameScore()
    {
        try
        {
            if (GameRules() is not { } rules)
            {
                return null;
            }
            var teams = Utilities.FindAllEntitiesByDesignerName<CCSTeam>("cs_team_manager").ToList();
            var ct = teams.FirstOrDefault(t => t.TeamNum == (int)CsTeam.CounterTerrorist);
            var t = teams.FirstOrDefault(team => team.TeamNum == (int)CsTeam.Terrorist);
            return ct is null || t is null ? null : new GameScore(rules.TotalRoundsPlayed, ct.Score, t.Score);
        }
        catch (Exception)
        {
            return null;
        }
    }

    /// <summary>Nulo para quem não é jogador de verdade (sem controller, HLTV).</summary>
    private static PlayerRef? PlayerRefOf(CCSPlayerController? player)
    {
        if (player is null || !player.IsValid || player.IsHLTV)
        {
            return null;
        }
        GameTeam? team = player.Team switch
        {
            CsTeam.CounterTerrorist => GameTeam.Ct,
            CsTeam.Terrorist => GameTeam.T,
            _ => null,
        };
        return new PlayerRef(player.IsBot ? 0 : player.SteamID, player.IsBot, team);
    }

    /// <summary>O Deathmatch roda todos contra todos: ninguém é aliado.</summary>
    private static bool TeammatesAreEnemies() =>
        ConVar.Find("mp_teammates_are_enemies")?.GetPrimitiveValue<bool>() ?? false;

    private bool IsWarmup() => GameRules()?.WarmupPeriod ?? false;

    private CCSGameRules? GameRules()
    {
        _gameRules ??= Utilities.FindAllEntitiesByDesignerName<CCSGameRulesProxy>("cs_gamerules").FirstOrDefault()?.GameRules;
        return _gameRules;
    }
}
