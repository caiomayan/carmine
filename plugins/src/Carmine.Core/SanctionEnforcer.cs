using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>O que o plugin faz no jogo por causa de uma Punição.</summary>
public abstract record SanctionAction(ulong SteamId)
{
    /// <summary>Mostra a mensagem e tira o jogador do servidor (<see cref="Ban"/>: banido, não só expulso).</summary>
    public sealed record Kick(ulong SteamId, string Message, bool Ban) : SanctionAction(SteamId);

    /// <summary>Mostra a mensagem ao jogador (aviso, ou o início de um mute/gag).</summary>
    public sealed record Notify(ulong SteamId, string Message) : SanctionAction(SteamId);

    /// <summary>Liga ou desliga a voz do jogador.</summary>
    public sealed record SetMuted(ulong SteamId, bool Muted) : SanctionAction(SteamId);
}

/// <summary>
/// Aplica no jogo as Punições que a API devolve no connect e em cada batimento (S07). A lista da
/// API é a verdade para os jogadores dela: mute e gag valem até <c>EndsAt</c> ou até sumirem da
/// lista (revogados); ban tira o jogador sempre que aparece; kick e aviso são executados uma vez só
/// por id (eles vêm em vários batimentos seguidos). Sem estado de jogo: devolve as ações, e o
/// plugin as executa na thread do jogo, que é a única que chama esta classe.
/// </summary>
public sealed class SanctionEnforcer(TimeProvider time)
{
    /// <summary>Ids de kick/aviso lembrados; eles só vêm por 60 s, então poucos bastam.</summary>
    private const int RememberedInstant = 512;

    private readonly Dictionary<ulong, Restriction> _mutes = [];
    private readonly Dictionary<ulong, Restriction> _gags = [];
    private readonly HashSet<Guid> _executed = [];
    private readonly Queue<Guid> _executedOrder = new();

    private sealed record Restriction(Guid Id, DateTimeOffset? EndsAt, string Message);

    /// <summary>
    /// Aplica a lista da API aos <paramref name="players"/> (os do batimento, ou só quem conectou):
    /// o que não está na lista para eles deixa de valer.
    /// </summary>
    public IReadOnlyList<SanctionAction> Apply(IEnumerable<GameSanction> sanctions, IReadOnlyCollection<ulong> players)
    {
        var now = time.GetUtcNow();
        var bySteamId = sanctions
            .Select(s => (SteamId: ParseSteamId(s.SteamId), Sanction: s))
            .Where(x => x.SteamId != 0 && players.Contains(x.SteamId))
            .ToLookup(x => x.SteamId, x => x.Sanction);
        var actions = new List<SanctionAction>();
        foreach (var steamId in players)
        {
            var list = bySteamId[steamId].ToList();
            if (list.FirstOrDefault(s => s.Type == SanctionType.Ban && Valid(s, now)) is { } ban)
            {
                actions.Add(new SanctionAction.Kick(steamId, ban.Message, Ban: true));
                continue;
            }
            foreach (var instant in list.Where(s => s.Type is SanctionType.Kick or SanctionType.Warning))
            {
                if (!Remember(instant.Id))
                {
                    continue;
                }
                actions.Add(instant.Type == SanctionType.Kick
                    ? new SanctionAction.Kick(steamId, instant.Message, Ban: false)
                    : new SanctionAction.Notify(steamId, instant.Message));
            }
            var mute = Latest(list, SanctionType.Mute, now);
            var wasMuted = _mutes.ContainsKey(steamId);
            Update(_mutes, steamId, mute);
            if (mute is not null && !wasMuted)
            {
                actions.Add(new SanctionAction.SetMuted(steamId, true));
                actions.Add(new SanctionAction.Notify(steamId, mute.Message));
            }
            else if (mute is null && wasMuted)
            {
                actions.Add(new SanctionAction.SetMuted(steamId, false));
            }
            var gag = Latest(list, SanctionType.Gag, now);
            if (gag is not null && !_gags.ContainsKey(steamId))
            {
                actions.Add(new SanctionAction.Notify(steamId, gag.Message));
            }
            Update(_gags, steamId, gag);
        }
        return actions;
    }

    /// <summary>A mensagem do gag se o jogador está sem chat agora; senão, <c>null</c>.</summary>
    public string? GagMessage(ulong steamId) =>
        _gags.TryGetValue(steamId, out var gag) && Valid(gag.EndsAt, time.GetUtcNow()) ? gag.Message : null;

    /// <summary>
    /// Um comando de chat de uma palavra (<c>!ws</c>, <c>/ws</c>) passa mesmo com gag: os plugins os
    /// leem do chat, e sem eles o jogador perderia o Loadout.
    /// </summary>
    public static bool IsChatCommand(string text) =>
        text.Length is > 1 and <= 32
        && text[0] is '!' or '/'
        && text.Skip(1).All(c => char.IsAsciiLetterOrDigit(c) || c == '_');

    /// <summary>O jogador saiu: o próximo connect traz o estado dele de novo.</summary>
    public void Forget(ulong steamId)
    {
        _mutes.Remove(steamId);
        _gags.Remove(steamId);
    }

    private static Restriction? Latest(List<GameSanction> list, SanctionType type, DateTimeOffset now) =>
        list.Where(s => s.Type == type && Valid(s, now))
            .OrderByDescending(s => s.EndsAt ?? DateTimeOffset.MaxValue)
            .Select(s => new Restriction(s.Id, s.EndsAt, s.Message))
            .FirstOrDefault();

    private static void Update(Dictionary<ulong, Restriction> state, ulong steamId, Restriction? restriction)
    {
        if (restriction is null)
        {
            state.Remove(steamId);
        }
        else
        {
            state[steamId] = restriction;
        }
    }

    private static bool Valid(GameSanction sanction, DateTimeOffset now) => Valid(sanction.EndsAt, now);

    private static bool Valid(DateTimeOffset? endsAt, DateTimeOffset now) => endsAt is null || endsAt > now;

    /// <summary>Falso se o id já foi executado.</summary>
    private bool Remember(Guid id)
    {
        if (!_executed.Add(id))
        {
            return false;
        }
        _executedOrder.Enqueue(id);
        if (_executedOrder.Count > RememberedInstant)
        {
            _executed.Remove(_executedOrder.Dequeue());
        }
        return true;
    }

    private static ulong ParseSteamId(string steamId) =>
        ulong.TryParse(steamId, NumberStyles.None, CultureInfo.InvariantCulture, out var id) ? id : 0;
}
