using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>
/// As Preferências de jogo do Deathmatch (ADR 0028): sons, mensagens, <c>!hs</c> e <c>!noprimary</c> moram na
/// Conta, na API, e valem em todo servidor de Deathmatch; o plugin só guarda uma cópia na memória da sessão. O
/// Core aplica o valor da Conta no primeiro spawn de cada conexão, sem avisar o jogador, e leva à API, em silêncio,
/// o que o jogador muda pelo menu <c>!dm</c> ou por um atalho. Segura para uso por várias threads.
/// </summary>
public sealed class DeathmatchPreferences(ICarmineApiClient api)
{
    /// <summary>A chave da Conta e o nome que o Deathmatch v1.3.6 dá à mesma preferência (<c>RegisterPreference</c>).</summary>
    public static readonly IReadOnlyList<(GamePreferenceKey Key, string PluginName)> Map =
    [
        (GamePreferenceKey.Kill_sound, "KillSound"),
        (GamePreferenceKey.Headshot_kill_sound, "HeadshotKillSound"),
        (GamePreferenceKey.Knife_kill_sound, "KnifeKillSound"),
        (GamePreferenceKey.Hit_sound, "HitSound"),
        (GamePreferenceKey.New_mode_sound, "NewModeSound"),
        (GamePreferenceKey.No_primary, "NoPrimary"),
        (GamePreferenceKey.Only_headshot, "OnlyHS"),
        (GamePreferenceKey.Hud_messages, "HudMessages"),
        (GamePreferenceKey.Damage_info, "DamageInfo"),
    ];

    private readonly Lock _lock = new();
    private readonly Dictionary<ulong, IReadOnlyDictionary<string, bool>> _pending = [];
    private readonly Dictionary<(ulong SteamId, GamePreferenceKey Key), Task> _tails = [];

    /// <summary>A chave da Conta para o nome da preferência no plugin; <c>null</c> se o Carmine não a guarda.</summary>
    public static GamePreferenceKey? KeyFor(string pluginName)
    {
        foreach (var (key, name) in Map)
        {
            if (name == pluginName)
            {
                return key;
            }
        }
        return null;
    }

    /// <summary>Os valores da Conta, por nome de preferência do plugin.</summary>
    public static IReadOnlyDictionary<string, bool> ValuesOf(GamePreferences preferences) =>
        new Dictionary<string, bool>
        {
            ["KillSound"] = preferences.KillSound,
            ["HeadshotKillSound"] = preferences.HeadshotKillSound,
            ["KnifeKillSound"] = preferences.KnifeKillSound,
            ["HitSound"] = preferences.HitSound,
            ["NewModeSound"] = preferences.NewModeSound,
            ["NoPrimary"] = preferences.NoPrimary,
            ["OnlyHS"] = preferences.OnlyHeadshot,
            ["HudMessages"] = preferences.HudMessages,
            ["DamageInfo"] = preferences.DamageInfo,
        };

    /// <summary>
    /// A API respondeu ao connect com o estado da Conta. Devolve o que aplicar agora se o jogador já está vivo num
    /// time; senão o guarda para o spawn (no connect o Deathmatch ainda não tem os dados do jogador).
    /// </summary>
    public IReadOnlyDictionary<string, bool>? OnConnectResult(ulong steamId, GamePreferences preferences, bool isAlive)
    {
        var values = ValuesOf(preferences);
        lock (_lock)
        {
            if (isAlive)
            {
                _pending.Remove(steamId);
                return values;
            }
            _pending[steamId] = values;
            return null;
        }
    }

    /// <summary>O jogador nasceu: os valores guardados, uma única vez; <c>null</c> se não há.</summary>
    public IReadOnlyDictionary<string, bool>? TakeOnSpawn(ulong steamId)
    {
        lock (_lock)
        {
            return _pending.Remove(steamId, out var values) ? values : null;
        }
    }

    /// <summary>
    /// O plugin ainda não tinha os dados do jogador e recusou: guarda de novo para o próximo spawn, a não ser que
    /// um connect mais novo já tenha trazido outro estado.
    /// </summary>
    public void Requeue(ulong steamId, IReadOnlyDictionary<string, bool> values)
    {
        lock (_lock)
        {
            _pending.TryAdd(steamId, values);
        }
    }

    public void OnDisconnect(ulong steamId)
    {
        lock (_lock)
        {
            _pending.Remove(steamId);
        }
    }

    /// <summary>
    /// O jogador mudou uma preferência no Deathmatch: grava o valor explícito na Conta. Chame na thread do jogo, na
    /// ordem em que o jogador mudou: os PUTs do mesmo jogador e da mesma chave saem um de cada vez, nessa ordem
    /// (dois toggles rápidos nunca chegam trocados à API, que ficaria com o valor antigo). Sem texto para o jogador;
    /// se a API não respondeu, a Conta fica com o valor antigo e o plugin com o novo até o próximo connect. A tarefa
    /// devolve se gravou e nunca lança.
    /// </summary>
    public Task<bool> EnqueueSave(ulong steamId, GamePreferenceKey key, bool enabled, CancellationToken cancellationToken)
    {
        lock (_lock)
        {
            _tails.TryGetValue((steamId, key), out var previous);
            var next = SaveAfterAsync(previous, steamId, key, enabled, cancellationToken);
            _tails[(steamId, key)] = next;
            _ = next.ContinueWith(
                _ =>
                {
                    lock (_lock)
                    {
                        if (_tails.TryGetValue((steamId, key), out var tail) && ReferenceEquals(tail, next))
                        {
                            _tails.Remove((steamId, key));
                        }
                    }
                },
                CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously,
                TaskScheduler.Default);
            return next;
        }
    }

    private async Task<bool> SaveAfterAsync(
        Task? previous,
        ulong steamId,
        GamePreferenceKey key,
        bool enabled,
        CancellationToken cancellationToken)
    {
        if (previous is not null)
        {
            await previous.ConfigureAwait(false);
        }
        return await SaveAsync(steamId, key, enabled, cancellationToken).ConfigureAwait(false);
    }

    private async Task<bool> SaveAsync(ulong steamId, GamePreferenceKey key, bool enabled, CancellationToken cancellationToken)
    {
        try
        {
            await api.SetPlayerGamePreferenceAsync(
                steamId.ToString(CultureInfo.InvariantCulture),
                key,
                new GamePreferenceSet { Enabled = enabled },
                cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (Exception error) when (error is ApiException or HttpRequestException or OperationCanceledException)
        {
            return false;
        }
    }
}
