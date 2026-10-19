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
    private CCSGameRules? _gameRules;

    private void LoadEvents(ICarmineApiClient client, bool hotReload)
    {
        _events = new EventReporter(client, TimeProvider.System, Config.EventQueueLimit);
        _recorder = new EventRecorder(_events, TimeProvider.System);

        RegisterEventHandler<EventPlayerDeath>(OnPlayerDeath);
        RegisterEventHandler<EventPlayerHurt>(OnPlayerHurt);
        RegisterEventHandler<EventRoundStart>(OnRoundStartEvents);
        RegisterEventHandler<EventRoundEnd>(OnRoundEndEvents);
        RegisterListener<Listeners.OnMapEnd>(FlushEvents);
        AddTimer(Config.EventFlushIntervalSeconds, FlushEvents, TimerFlags.REPEAT);

        if (hotReload)
        {
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
        _recorder?.RoundEnded(winner, IsWarmup());
        return HookResult.Continue;
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
