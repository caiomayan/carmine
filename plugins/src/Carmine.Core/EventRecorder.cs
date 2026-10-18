using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>
/// Quem participou de um evento do jogo. <see cref="Team"/> é nulo para quem não está num time
/// (espectador); um bot não tem SteamID64 útil.
/// </summary>
public sealed record PlayerRef(ulong SteamId, bool IsBot, GameTeam? Team);

/// <summary>
/// Transforma o que o jogo conta (morte, dano, round, entrada e saída) nos eventos da S12 e os
/// põe na fila (<see cref="EventReporter"/>). Só diz o que aconteceu; quem decide o que conta nas
/// Estatísticas é a API (bot, aquecimento, kill em aliado). Só roda na thread do jogo. Um round
/// abandonado no meio conta como jogado: a lista do round é a de quem estava nele no começo.
/// </summary>
public sealed class EventRecorder(EventReporter reporter, TimeProvider time)
{
    private readonly Dictionary<ulong, (Guid SessionId, DateTimeOffset StartedAt)> _sessions = [];
    private List<RoundPlayer> _roster = [];

    /// <summary>Um jogador humano entrou no servidor (uma Sessão de jogo por vez para cada um).</summary>
    public void PlayerJoined(ulong steamId)
    {
        if (steamId == 0 || _sessions.ContainsKey(steamId))
        {
            return;
        }
        var now = time.GetUtcNow();
        var sessionId = NewId();
        _sessions[steamId] = (sessionId, now);
        reporter.Add(new SessionStartEvent { Id = NewId(), At = now, SessionId = sessionId, SteamId = Text(steamId) });
    }

    public void PlayerLeft(ulong steamId)
    {
        if (!_sessions.Remove(steamId, out var session))
        {
            return;
        }
        reporter.Add(Ended(steamId, session));
    }

    /// <summary>O plugin vai sair: fecha as Sessões abertas para o tempo jogado não se perder.</summary>
    public void CloseAllSessions()
    {
        foreach (var (steamId, session) in _sessions)
        {
            reporter.Add(Ended(steamId, session));
        }
        _sessions.Clear();
    }

    /// <param name="killer">Nulo: o mundo (queda, bomba).</param>
    /// <param name="teammatesAreEnemies">Todos contra todos (Deathmatch): ninguém é aliado.</param>
    public void Kill(
        PlayerRef? killer,
        PlayerRef victim,
        PlayerRef? assister,
        bool headshot,
        string weapon,
        bool warmup,
        bool teammatesAreEnemies)
    {
        // Bot contra bot não interessa a ninguém.
        if (!IsHuman(killer) && !IsHuman(victim))
        {
            return;
        }
        var suicide = killer == victim;
        var teamKill = !suicide && !teammatesAreEnemies && killer?.Team is { } team && team == victim.Team;
        reporter.Add(new KillEvent
        {
            Id = NewId(),
            At = time.GetUtcNow(),
            Warmup = warmup,
            KillerSteamId = SteamIdOf(killer),
            KillerIsBot = killer?.IsBot ?? false,
            VictimSteamId = SteamIdOf(victim),
            VictimIsBot = victim.IsBot,
            AssisterSteamId = SteamIdOf(assister),
            AssisterIsBot = assister?.IsBot ?? false,
            Headshot = headshot,
            Weapon = weapon.Length > 64 ? weapon[..64] : weapon,
            TeamKill = teamKill,
        });
    }

    /// <summary>
    /// Dano de um humano num inimigo humano. Bot e aliado nunca contam, então nem saem do
    /// servidor (a API também descarta); o mundo e o dano em si mesmo não têm atacante.
    /// </summary>
    public void Damage(PlayerRef attacker, PlayerRef victim, int amount, bool warmup, bool teammatesAreEnemies)
    {
        if (!IsHuman(attacker) || !IsHuman(victim) || attacker == victim || amount < 1)
        {
            return;
        }
        if (!teammatesAreEnemies && attacker.Team is { } team && team == victim.Team)
        {
            return;
        }
        reporter.Add(new DamageEvent
        {
            Id = NewId(),
            At = time.GetUtcNow(),
            Warmup = warmup,
            AttackerSteamId = Text(attacker.SteamId),
            VictimIsBot = false,
            TeamDamage = false,
            Amount = Math.Min(amount, 500),
        });
    }

    /// <summary>Quem está no round que começa (humanos num time).</summary>
    public void RoundStarted(IEnumerable<PlayerRef> players) =>
        _roster =
        [
            .. players
                .Where(p => IsHuman(p) && p.Team is not null)
                .DistinctBy(p => p.SteamId)
                .Select(p => new RoundPlayer { SteamId = Text(p.SteamId), Team = p.Team!.Value }),
        ];

    public void RoundEnded(RoundWinner winner, bool warmup)
    {
        if (_roster.Count == 0)
        {
            return;
        }
        reporter.Add(new RoundEndEvent
        {
            Id = NewId(),
            At = time.GetUtcNow(),
            Warmup = warmup,
            Winner = winner,
            Players = _roster,
        });
        _roster = [];
    }

    private SessionEndEvent Ended(ulong steamId, (Guid SessionId, DateTimeOffset StartedAt) session) => new()
    {
        Id = NewId(),
        At = time.GetUtcNow(),
        SessionId = session.SessionId,
        SteamId = Text(steamId),
        StartedAt = session.StartedAt,
    };

    private static bool IsHuman(PlayerRef? player) => player is { IsBot: false, SteamId: not 0 };

    private static string? SteamIdOf(PlayerRef? player) => IsHuman(player) ? Text(player!.SteamId) : null;

    private static string Text(ulong steamId) => steamId.ToString(CultureInfo.InvariantCulture);

    private Guid NewId() => Guid.CreateVersion7(time.GetUtcNow());
}
