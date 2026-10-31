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
/// S12b: os eventos levam o que a API precisa para o detalhe (o lado de quem matou, o mapa, o
/// número e o placar do round, os mapas de cada Sessão); tudo opcional para a API.
/// </summary>
/// <param name="match">O placar de times (Retake); sem ele os rounds saem sem número nem placar.</param>
public sealed class EventRecorder(EventReporter reporter, TimeProvider time, MatchTracker? match = null)
{
    /// <summary>Quantos mapas distintos uma Sessão leva (o limite do contrato).</summary>
    public const int MaxSessionMaps = 8;

    private const int MaxMapNameLength = 64;

    private sealed record OpenSession(Guid SessionId, DateTimeOffset StartedAt, List<string> Maps);

    private readonly Dictionary<ulong, OpenSession> _sessions = [];
    private List<RoundPlayer> _roster = [];
    private RoundContext? _round;
    private bool _collect;
    private string? _map;

    /// <summary>O mapa atual: entra no início das Sessões que abrem e nos fins de round.</summary>
    public string? Map => _map;

    /// <summary>Um mapa começou: as Sessões abertas passam a incluí-lo (o Deathmatch rotaciona com gente dentro).</summary>
    public void MapStarted(string? map)
    {
        _map = Clean(map);
        if (_map is null)
        {
            return;
        }
        foreach (var session in _sessions.Values)
        {
            AddMap(session.Maps, _map);
        }
    }

    /// <summary>Um jogador humano entrou no servidor (uma Sessão de jogo por vez para cada um).</summary>
    public void PlayerJoined(ulong steamId)
    {
        if (steamId == 0 || _sessions.ContainsKey(steamId))
        {
            return;
        }
        var now = time.GetUtcNow();
        var sessionId = NewId();
        _sessions[steamId] = new OpenSession(sessionId, now, _map is null ? [] : [_map]);
        reporter.Add(new SessionStartEvent
        {
            Id = NewId(),
            At = now,
            SessionId = sessionId,
            SteamId = Text(steamId),
            Map = _map,
        });
    }

    public void PlayerLeft(ulong steamId)
    {
        if (!_sessions.Remove(steamId, out var session))
        {
            return;
        }
        reporter.Add(Ended(steamId, session));
    }

    /// <summary>
    /// Uma mensagem de chat de um humano (S13): vai para o log com o lado em que ele estava e se foi
    /// chat de time. O que não entra no log está em <see cref="ChatLogFilter"/>.
    /// </summary>
    public void Chat(PlayerRef speaker, bool teamChat, string? text)
    {
        if (!IsHuman(speaker) || ChatLogFilter.Clean(text) is not { } clean)
        {
            return;
        }
        reporter.Add(new ChatMessageEvent
        {
            Id = NewId(),
            At = time.GetUtcNow(),
            SteamId = Text(speaker.SteamId),
            Team = speaker.Team switch
            {
                GameTeam.Ct => ChatTeam.Ct,
                GameTeam.T => ChatTeam.T,
                _ => ChatTeam.Spectator,
            },
            TeamChat = teamChat,
            Text = clean,
        });
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
    /// <param name="detail">A coleta por round (S17): como foi a kill. Ausente, a kill sai só com o que a S12 pede.</param>
    /// <remarks>
    /// O plugin só relata (ADR 0018): bot contra bot e kill em aliado também saem, marcados; a API decide o que
    /// conta. A S17 precisa deles para contar os vivos e o clutch.
    /// </remarks>
    public void Kill(
        PlayerRef? killer,
        PlayerRef victim,
        PlayerRef? assister,
        bool headshot,
        string weapon,
        bool warmup,
        bool teammatesAreEnemies,
        KillDetail? detail = null)
    {
        var suicide = killer == victim;
        var teamKill = !suicide && !teammatesAreEnemies && killer?.Team is { } team && team == victim.Team;
        var round = RoundContextFor(warmup);
        reporter.Add(new KillEvent
        {
            Id = NewId(),
            At = time.GetUtcNow(),
            Warmup = warmup,
            KillerSteamId = SteamIdOf(killer),
            KillerIsBot = killer?.IsBot ?? false,
            KillerTeam = IsHuman(killer) ? killer!.Team : null,
            VictimSteamId = SteamIdOf(victim),
            VictimIsBot = victim.IsBot,
            AssisterSteamId = SteamIdOf(assister),
            AssisterIsBot = assister?.IsBot ?? false,
            Headshot = headshot,
            Weapon = weapon.Length > 64 ? weapon[..64] : weapon,
            TeamKill = teamKill,
            MapPlayId = round?.MapPlayId,
            RoundNumber = round?.Number,
            AtMs = round is null ? null : time.GetUtcNow().ToUnixTimeMilliseconds(),
            VictimTeam = round is null ? null : victim.Team,
            FlashAssist = detail?.FlashAssist,
            Penetrated = detail?.Penetrated,
            ThroughSmoke = detail?.ThroughSmoke,
            AttackerBlind = detail?.AttackerBlind,
            NoScope = detail?.NoScope,
            Distance = detail?.Distance,
            KillerPosition = detail?.KillerPosition?.ToPosition(),
            VictimPosition = detail?.VictimPosition?.ToPosition(),
        });
    }

    /// <summary>
    /// Dano de um humano em outro jogador: inimigo, aliado (<c>TeamDamage</c>) ou bot (<c>VictimIsBot</c>) saem, e a
    /// API decide o que conta (ADR 0018: só o dano em inimigo humano). Quem causa o dano precisa ser humano, porque o
    /// contrato leva o SteamID64 de quem atacou; o mundo e o dano em si mesmo não têm atacante.
    /// </summary>
    public void Damage(
        PlayerRef attacker,
        PlayerRef victim,
        int amount,
        bool warmup,
        bool teammatesAreEnemies,
        DamageDetail? detail = null)
    {
        if (!IsHuman(attacker) || attacker == victim || amount < 1)
        {
            return;
        }
        var round = RoundContextFor(warmup);
        reporter.Add(new DamageEvent
        {
            Id = NewId(),
            At = time.GetUtcNow(),
            Warmup = warmup,
            AttackerSteamId = Text(attacker.SteamId),
            VictimIsBot = victim.IsBot,
            TeamDamage = !teammatesAreEnemies && attacker.Team is { } team && team == victim.Team,
            Amount = Math.Min(amount, 500),
            MapPlayId = round?.MapPlayId,
            RoundNumber = round?.Number,
            AtMs = round is null ? null : time.GetUtcNow().ToUnixTimeMilliseconds(),
            VictimSteamId = SteamIdOf(victim),
            Weapon = detail?.Weapon is { Length: > 0 } weapon ? (weapon.Length > 64 ? weapon[..64] : weapon) : null,
            Hitgroup = detail?.Hitgroup is >= 0 and <= 10 ? detail.Hitgroup : null,
            ArmorDamage = detail is null ? null : Math.Clamp(detail.ArmorDamage, 0, 500),
            HealthDamage = detail is null ? null : Math.Clamp(detail.HealthDamage, 0, 500),
        });
    }

    /// <summary>
    /// Quem está no round que começa (humanos num time), na hora em que o round abre (ainda no freeze). Com
    /// <paramref name="collect"/> (round de verdade: fora do aquecimento, com placar de times) e humanos nos dois
    /// lados, o round conta para a coleta por round e os eventos dele levam o contexto a partir do
    /// <see cref="FreezeEnded"/>; um round sem humanos nos dois lados (os sintéticos do cs2-retakes) não conta.
    /// </summary>
    public void RoundStarted(IEnumerable<PlayerRef> players, bool collect = false)
    {
        _roster =
        [
            .. players
                .Where(p => IsHuman(p) && p.Team is not null)
                .DistinctBy(p => p.SteamId)
                .Select(p => new RoundPlayer { SteamId = Text(p.SteamId), Team = p.Team!.Value }),
        ];
        _round = null;
        _collect = collect
            && match is not null
            && _roster.Any(p => p.Team == GameTeam.Ct)
            && _roster.Any(p => p.Team == GameTeam.T);
    }

    /// <summary>
    /// O freeze acabou (S17): o round vale. Abre o contexto da coleta (mapa jogado, número do round, horário) e manda o
    /// <c>round_start</c> com o lado e o valor do equipamento de cada humano e quantos bots há em cada lado.
    /// </summary>
    public void FreezeEnded(IEnumerable<RoundPlayerInfo> everyone)
    {
        if (!_collect || match is null)
        {
            return;
        }
        var now = time.GetUtcNow();
        _round = new RoundContext(match.MapPlayId, match.RoundsPlayed + 1, now);
        var all = everyone.Where(i => i.Player.Team is not null).ToList();
        reporter.Add(new RoundStartEvent
        {
            Id = NewId(),
            At = now,
            AtMs = now.ToUnixTimeMilliseconds(),
            Warmup = false,
            MapPlayId = _round.MapPlayId,
            RoundNumber = _round.Number,
            Map = _map,
            Players =
            [
                .. all
                    .Where(i => IsHuman(i.Player))
                    .DistinctBy(i => i.Player.SteamId)
                    .Select(i => new RoundStartPlayer
                    {
                        SteamId = Text(i.Player.SteamId),
                        Team = i.Player.Team!.Value,
                        EquipmentValue = Math.Clamp(i.EquipmentValue, 0, 100_000),
                    }),
            ],
            BotsCt = all.Count(i => i.Player.IsBot && i.Player.Team == GameTeam.Ct),
            BotsT = all.Count(i => i.Player.IsBot && i.Player.Team == GameTeam.T),
        });
    }

    /// <summary>A bomba foi plantada, desarmada ou explodiu (S17). Só em round de coleta, fora do aquecimento.</summary>
    public void Bomb(BombEventKind kind, PlayerRef? actor, BombSite? site, bool warmup)
    {
        if (RoundContextFor(warmup) is not { } round)
        {
            return;
        }
        var now = time.GetUtcNow();
        reporter.Add(new BombEvent
        {
            Id = NewId(),
            At = now,
            AtMs = now.ToUnixTimeMilliseconds(),
            Warmup = false,
            MapPlayId = round.MapPlayId,
            RoundNumber = round.Number,
            Kind = kind,
            SteamId = kind == BombEventKind.Explode ? null : SteamIdOf(actor),
            Site = site,
        });
    }

    /// <summary>
    /// O round acabou. Fora do aquecimento e com humanos nos dois lados, o evento leva o número do
    /// round no mapa e o placar depois dele (<see cref="MatchTracker"/>); sem isso (ou num mapa sem
    /// placar de times, <paramref name="teammatesAreEnemies"/>), só o mapa. Num round de coleta (S17) leva também o
    /// mapa jogado, o motivo, a duração e quem estava vivo (<paramref name="info"/>).
    /// </summary>
    public void RoundEnded(RoundWinner winner, bool warmup, bool teammatesAreEnemies = false, RoundEndInfo? info = null)
    {
        if (_roster.Count == 0)
        {
            return;
        }
        var humansOnBothSides = _roster.Any(p => p.Team == GameTeam.Ct) && _roster.Any(p => p.Team == GameTeam.T);
        var result = teammatesAreEnemies ? null : match?.RoundEnded(winner, warmup, humansOnBothSides);
        var now = time.GetUtcNow();
        var round = result is not null ? _round : null;
        reporter.Add(new RoundEndEvent
        {
            Id = NewId(),
            At = now,
            Warmup = warmup,
            Winner = winner,
            Players = _roster,
            Map = _map,
            RoundNumber = result?.RoundNumber,
            ScoreCt = result?.CtScore,
            ScoreT = result?.TScore,
            MapPlayId = round?.MapPlayId,
            AtMs = round is null ? null : now.ToUnixTimeMilliseconds(),
            Reason = round is null ? null : info?.Reason ?? RoundEndReason.Other,
            DurationMs = round is null ? null : (int)Math.Clamp((now - round.StartedAt).TotalMilliseconds, 0, 3_600_000),
            Alive = round is null || info is null
                ? null
                : [.. info.AliveHumans.Where(id => id != 0).Distinct().Select(Text)],
        });
        _roster = [];
        _round = null;
        _collect = false;
    }

    /// <summary>O contexto dos eventos do round em andamento, se ele é de coleta; aquecimento nunca é.</summary>
    private RoundContext? RoundContextFor(bool warmup) => warmup ? null : _round;

    private SessionEndEvent Ended(ulong steamId, OpenSession session) => new()
    {
        Id = NewId(),
        At = time.GetUtcNow(),
        SessionId = session.SessionId,
        SteamId = Text(steamId),
        StartedAt = session.StartedAt,
        Maps = session.Maps.Count > 0 ? [.. session.Maps] : null,
    };

    private static void AddMap(List<string> maps, string map)
    {
        if (maps.Count < MaxSessionMaps && !maps.Contains(map))
        {
            maps.Add(map);
        }
    }

    /// <summary>O nome do mapa como o contrato o quer: sem espaços nas pontas, até 64 caracteres, nunca vazio.</summary>
    private static string? Clean(string? map)
    {
        var name = map?.Trim();
        return string.IsNullOrEmpty(name) ? null : name.Length > MaxMapNameLength ? name[..MaxMapNameLength] : name;
    }

    private static bool IsHuman(PlayerRef? player) => player is { IsBot: false, SteamId: not 0 };

    private static string? SteamIdOf(PlayerRef? player) => IsHuman(player) ? Text(player!.SteamId) : null;

    private static string Text(ulong steamId) => steamId.ToString(CultureInfo.InvariantCulture);

    private Guid NewId() => Guid.CreateVersion7(time.GetUtcNow());
}
