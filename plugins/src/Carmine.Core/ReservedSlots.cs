namespace Carmine.Core;

/// <summary>Como a Vaga reservada funciona neste Servidor Carmine (S14).</summary>
public enum ReservedSlotsMode
{
    /// <summary>Sem Vaga reservada: o maxplayers é o limite para todos.</summary>
    Off,

    /// <summary>Uma vaga de folga: o VIP entra nela e, no fim do round, um jogador sem VIP sai.</summary>
    Retake,

    /// <summary>Vagas extras acima das públicas, só para VIP, sem retirar ninguém.</summary>
    Deathmatch,
}

/// <summary>Um jogador humano no fim do round: espectador (ou na fila do Retake) ou num time.</summary>
public sealed record SlotPlayer(ulong SteamId, bool IsSpectator);

/// <summary>Um jogador que sai para abrir a vaga de um VIP, com a mensagem combinada.</summary>
public sealed record SlotRemoval(ulong SteamId, string Message);

/// <summary>Posição e mira de um jogador vivo, para saber se ele está AFK.</summary>
public readonly record struct PlayerPose(float X, float Y, float Z, float Pitch, float Yaw);

/// <summary>
/// A Vaga reservada (S14). O servidor aceita conexões além das <c>publicSlots</c> vagas públicas
/// (maxplayers maior), e quem entra além delas só fica se a API disser que é VIP:
/// <list type="bullet">
/// <item>Sem VIP, sai na hora com <see cref="FullMessage"/>, nos dois Modos.</item>
/// <item>No Deathmatch, o VIP simplesmente ocupa a vaga extra.</item>
/// <item>No Retake, o VIP espera (na fila do cs2-retakes) e, no fim do round, sai um jogador sem
/// VIP nesta ordem: espectador, AFK, o último que entrou. Quem sai fica protegido por
/// <see cref="Protection"/> e recebe <see cref="RemovedMessage"/>.</item>
/// </list>
/// Sem a resposta da API não se sabe quem é VIP: ninguém sai (falha aberta, como as Punições).
/// Sem estado de jogo: o plugin informa os eventos e executa as saídas na thread do jogo, que é a
/// única que chama esta classe.
/// </summary>
public sealed class ReservedSlots(ReservedSlotsMode mode, int publicSlots, TimeProvider time)
{
    /// <summary>Quem saiu para abrir vaga não é retirado de novo por este tempo.</summary>
    public static readonly TimeSpan Protection = TimeSpan.FromMinutes(30);

    /// <summary>Vivo e parado (sem andar nem mirar) por este tempo, somando os rounds: AFK.</summary>
    public static readonly TimeSpan AfkAfter = TimeSpan.FromSeconds(30);

    /// <summary>Uma amostra que chega muito depois da anterior (pausa, troca de mapa) conta no máximo isto.</summary>
    private static readonly TimeSpan MaxSampleGap = TimeSpan.FromSeconds(10);

    private const string VipPitch = "Com o VIP, sua vaga é garantida.";

    private readonly Dictionary<ulong, DateTimeOffset> _joinedAt = [];
    private readonly Dictionary<ulong, bool> _isVip = [];
    private readonly Dictionary<ulong, DateTimeOffset> _protectedUntil = [];
    private readonly Dictionary<ulong, Idle> _idle = [];
    private readonly HashSet<ulong> _leaving = [];

    private sealed class Idle
    {
        public PlayerPose? LastPose { get; set; }
        public DateTimeOffset LastSampleAt { get; set; }
        public TimeSpan Total { get; set; }
    }

    public static string RemovedMessage(string? vacancy) =>
        $"Vaga liberada para um VIP.{VacancyText(vacancy)} {VipPitch}";

    public static string FullMessage(string? vacancy) =>
        $"Servidor lotado: a vaga extra é reservada para VIP.{VacancyText(vacancy)} {VipPitch}";

    private static string VacancyText(string? vacancy) =>
        string.IsNullOrWhiteSpace(vacancy) ? "" : $" Há vaga em: {vacancy}.";

    /// <summary>O jogador terminou de conectar: conta como o último que entrou.</summary>
    public void OnJoin(ulong steamId)
    {
        _joinedAt[steamId] = time.GetUtcNow();
        _idle.Remove(steamId);
    }

    /// <summary>
    /// A API respondeu ao connect. <paramref name="humans"/> é quantos humanos estão no servidor
    /// agora, contando ele. Devolve se ele precisa sair já (lotado e sem VIP); a mensagem é
    /// <see cref="FullMessage"/>.
    /// </summary>
    public bool OnConnectResult(ulong steamId, bool isVip, int humans)
    {
        _isVip[steamId] = isVip;
        if (mode == ReservedSlotsMode.Off || isVip || humans <= publicSlots)
        {
            return false;
        }
        _leaving.Add(steamId);
        return true;
    }

    /// <summary>
    /// Retake lotado com um VIP esperando: alguém sai no fim do round. O plugin aproveita para
    /// buscar outro servidor com vaga para a mensagem.
    /// </summary>
    public bool HasVipWaiting(IReadOnlyCollection<ulong> humans) =>
        mode == ReservedSlotsMode.Retake
        && Staying(humans) > publicSlots
        && humans.Any(id => !_leaving.Contains(id) && _isVip.GetValueOrDefault(id));

    /// <summary>
    /// No fim do round (Retake): quem sai para abrir vaga aos VIPs além das vagas públicas.
    /// <paramref name="vacancy"/> é o outro servidor com vaga, se houver, para a mensagem.
    /// </summary>
    public IReadOnlyList<SlotRemoval> OnRoundEnd(IReadOnlyList<SlotPlayer> players, string? vacancy)
    {
        var steamIds = players.Select(p => p.SteamId).ToList();
        if (!HasVipWaiting(steamIds))
        {
            return [];
        }
        var now = time.GetUtcNow();
        var excess = Staying(steamIds) - publicSlots;
        var victims = players
            .Where(p => !_leaving.Contains(p.SteamId) && !_isVip.GetValueOrDefault(p.SteamId))
            .Where(p => !(_protectedUntil.TryGetValue(p.SteamId, out var until) && until > now))
            .OrderByDescending(p => p.IsSpectator)
            .ThenByDescending(p => IdleFor(p.SteamId) >= AfkAfter ? IdleFor(p.SteamId) : TimeSpan.Zero)
            .ThenByDescending(p => _joinedAt.GetValueOrDefault(p.SteamId))
            .Take(excess)
            .ToList();
        foreach (var victim in victims)
        {
            _leaving.Add(victim.SteamId);
            _protectedUntil[victim.SteamId] = now + Protection;
        }
        return [.. victims.Select(v => new SlotRemoval(v.SteamId, RemovedMessage(vacancy)))];
    }

    /// <summary>O jogador apareceu de novo: o novo spawn não conta como movimento.</summary>
    public void OnSpawn(ulong steamId)
    {
        if (_idle.TryGetValue(steamId, out var idle))
        {
            idle.LastPose = null;
        }
    }

    /// <summary>Amostra periódica de um jogador vivo num time.</summary>
    public void RecordPose(ulong steamId, PlayerPose pose)
    {
        var now = time.GetUtcNow();
        if (!_idle.TryGetValue(steamId, out var idle))
        {
            _idle[steamId] = new Idle { LastPose = pose, LastSampleAt = now };
            return;
        }
        if (idle.LastPose is { } last)
        {
            idle.Total = Moved(last, pose)
                ? TimeSpan.Zero
                : idle.Total + Min(now - idle.LastSampleAt, MaxSampleGap);
        }
        idle.LastPose = pose;
        idle.LastSampleAt = now;
    }

    /// <summary>O jogador desconectou. A proteção continua valendo se ele voltar.</summary>
    public void OnLeave(ulong steamId)
    {
        _joinedAt.Remove(steamId);
        _isVip.Remove(steamId);
        _idle.Remove(steamId);
        _leaving.Remove(steamId);
        var now = time.GetUtcNow();
        foreach (var expired in _protectedUntil.Where(p => p.Value <= now).Select(p => p.Key).ToList())
        {
            _protectedUntil.Remove(expired);
        }
    }

    private int Staying(IEnumerable<ulong> humans) => humans.Count(id => !_leaving.Contains(id));

    private TimeSpan IdleFor(ulong steamId) => _idle.TryGetValue(steamId, out var idle) ? idle.Total : TimeSpan.Zero;

    private static TimeSpan Min(TimeSpan a, TimeSpan b) => a < b ? a : b;

    /// <summary>Andou mais de uma unidade ou mexeu a mira mais de meio grau.</summary>
    private static bool Moved(PlayerPose a, PlayerPose b) =>
        Math.Abs(a.X - b.X) > 1f || Math.Abs(a.Y - b.Y) > 1f || Math.Abs(a.Z - b.Z) > 1f
        || Math.Abs(a.Pitch - b.Pitch) > 0.5f || Math.Abs(a.Yaw - b.Yaw) > 0.5f;
}
