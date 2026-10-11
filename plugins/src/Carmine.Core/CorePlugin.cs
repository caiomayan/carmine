using Carmine.Api.Client;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;

namespace Carmine.Core;

/// <summary>
/// Plugin próprio dos Servidores Carmine. Na S01: no connect, avisa a API (que cria a Conta no
/// primeiro), aplica o Nome de exibição no jogo (ADR 0008) e dá as boas-vindas no primeiro
/// connect. Com a API fora, o jogador joga com o nome Steam e o connect é reenviado depois; na
/// S05, ele também é avisado de que o Loadout não carregou (o cs2-css-inventory-simulator, sem
/// modificação, aplica o Loadout e não tem esse aviso).
/// As boas-vindas saem no primeiro spawn (no connect o jogador ainda está na escolha de time e
/// não vê o chat) e ficam guardadas até um spawn se ele sair antes.
/// Toda chamada HTTP roda fora da thread do jogo; o que mexe no jogo volta por Server.NextFrame.
/// </summary>
[MinimumApiVersion(376)]
public sealed class CorePlugin : BasePlugin, IPluginConfig<CoreConfig>
{
    public const string WelcomeMessage =
        "Bem-vindo ao Carmine. Ao jogar você concorda com os termos: stcarmine.com/termos";

    private readonly CancellationTokenSource _unloading = new();
    /// <summary>Nome de exibição aplicado por slot (só na thread do jogo).</summary>
    private readonly Dictionary<int, (ulong SteamId, string Name)> _displayNames = [];
    private HttpClient? _http;
    private AccountSync? _sync;
    private PendingWelcomes? _welcomes;
    private readonly LoadoutNotices _loadoutNotices = new();

    public override string ModuleName => "Carmine.Core";
    public override string ModuleVersion => "0.4.0";
    public override string ModuleAuthor => "Carmine";
    public override string ModuleDescription => "Conta, Nome de exibição e integração dos Servidores Carmine com a API.";

    public CoreConfig Config { get; set; } = new();

    public void OnConfigParsed(CoreConfig config)
    {
        if (!Uri.TryCreate(config.ApiBaseUrl, UriKind.Absolute, out _))
        {
            throw new ArgumentException($"ApiBaseUrl inválida: '{config.ApiBaseUrl}'", nameof(config));
        }
        if (config.TimeoutSeconds <= 0 || config.RetryIntervalSeconds <= 0)
        {
            throw new ArgumentException("TimeoutSeconds e RetryIntervalSeconds devem ser maiores que zero", nameof(config));
        }
        Config = config;
    }

    public override void Load(bool hotReload)
    {
        var options = new CarmineApiOptions(
            new Uri(Config.ApiBaseUrl),
            Config.ApiKey,
            TimeSpan.FromSeconds(Config.TimeoutSeconds));
        _http = CarmineApi.CreateHttpClient(options);
        var client = new CarmineApiClient(_http);

        // Fora da pasta do plugin, que o script de instalação apaga a cada deploy.
        var dataDir = Path.GetFullPath(Path.Combine(ModuleDirectory, "..", "..", "data", ModuleName));
        Directory.CreateDirectory(dataDir);
        var pending = new PendingConnects(new JsonFilePendingConnectsStore(Path.Combine(dataDir, "pending-connects.json")));
        if (pending.Count > 0)
        {
            Log.PendingLoaded(Logger, pending.Count);
        }
        _sync = new AccountSync(client, pending, TimeProvider.System);
        _welcomes = new PendingWelcomes(new JsonFilePendingWelcomesStore(Path.Combine(dataDir, "pending-welcomes.json")));

        RegisterEventHandler<EventPlayerConnectFull>(OnPlayerConnectFull);
        RegisterEventHandler<EventPlayerChangename>(OnPlayerChangename);
        RegisterEventHandler<EventPlayerSpawn>(OnPlayerSpawn);
        RegisterEventHandler<EventPlayerDisconnect>(OnPlayerDisconnect);
        AddTimer(Config.RetryIntervalSeconds, FlushPending, TimerFlags.REPEAT);

        var probe = new ApiHealthProbe(client);
        RunInBackground(async token =>
        {
            var result = await probe.ProbeAsync(token);
            if (result.Healthy)
            {
                Log.ApiHealthy(Logger, result.Summary);
            }
            else
            {
                Log.ApiUnhealthy(Logger, result.Summary);
            }
        });

        if (hotReload)
        {
            foreach (var player in Utilities.GetPlayers().Where(IsHuman))
            {
                SyncPlayer(player);
            }
        }
    }

    public override void Unload(bool hotReload)
    {
        _unloading.Cancel();
        _unloading.Dispose();
        _http?.Dispose();
        _http = null;
        _sync = null;
        _welcomes = null;
    }

    private HookResult OnPlayerConnectFull(EventPlayerConnectFull @event, GameEventInfo info)
    {
        if (@event.Userid is { } player && IsHuman(player))
        {
            SyncPlayer(player);
        }
        return HookResult.Continue;
    }

    /// <summary>O jogo troca o nome quando o jogador muda o nome Steam; reaplicamos o nosso.</summary>
    private HookResult OnPlayerChangename(EventPlayerChangename @event, GameEventInfo info)
    {
        if (@event.Userid is { } player && IsHuman(player))
        {
            var slot = player.Slot;
            Server.NextFrame(() =>
            {
                var current = Utilities.GetPlayerFromSlot(slot);
                if (current is not null && _displayNames.TryGetValue(slot, out var applied) && current.SteamID == applied.SteamId)
                {
                    ApplyName(current, applied.Name);
                }
            });
        }
        return HookResult.Continue;
    }

    /// <summary>
    /// O player_spawn também dispara quando o pawn é criado no connect, ainda sem time; por isso
    /// a checagem fica para o próximo frame e exige um jogador vivo num time.
    /// </summary>
    private HookResult OnPlayerSpawn(EventPlayerSpawn @event, GameEventInfo info)
    {
        if (@event.Userid is { } player && IsHuman(player))
        {
            var slot = player.Slot;
            Server.NextFrame(() =>
            {
                var current = Utilities.GetPlayerFromSlot(slot);
                if (current is null || !IsHuman(current) || !IsPlaying(current))
                {
                    return;
                }
                if (_welcomes?.TakeOnSpawn(current.SteamID) == true)
                {
                    current.PrintToChat($" {WelcomeMessage}");
                }
                if (_loadoutNotices.TakeOnSpawn(current.SteamID))
                {
                    current.PrintToChat($" {LoadoutNotices.Message}");
                }
            });
        }
        return HookResult.Continue;
    }

    private HookResult OnPlayerDisconnect(EventPlayerDisconnect @event, GameEventInfo info)
    {
        if (@event.Userid is { } player)
        {
            _displayNames.Remove(player.Slot);
            _loadoutNotices.OnDisconnect(player.SteamID);
        }
        return HookResult.Continue;
    }

    private void SyncPlayer(CCSPlayerController player)
    {
        var sync = _sync;
        if (sync is null)
        {
            return;
        }
        var steamId = player.SteamID;
        var steamName = player.PlayerName;
        RunInBackground(async token =>
        {
            switch (await sync.ConnectAsync(steamId, steamName, token))
            {
                case ConnectOutcome.Synced synced:
                    _loadoutNotices.OnConnect(steamId, apiReachable: true);
                    Log.ConnectSynced(Logger, steamId, synced.Result.DisplayName, synced.Result.PublicId, synced.Result.IsFirstConnect);
                    Server.NextFrame(() => ApplyResult(steamId, synced.Result));
                    // A API respondeu: se havia connects guardados, é hora de reenviá-los.
                    if (sync.PendingCount > 0)
                    {
                        await FlushAsync(sync, token);
                    }
                    break;
                case ConnectOutcome.Queued queued:
                    _loadoutNotices.OnConnect(steamId, apiReachable: false);
                    Log.ConnectQueued(Logger, steamId, queued.Reason, sync.PendingCount);
                    break;
                case ConnectOutcome.Rejected rejected:
                    Log.ConnectRejected(Logger, steamId, rejected.Reason);
                    break;
            }
        });
    }

    private void FlushPending()
    {
        if (_sync is { PendingCount: > 0 } sync)
        {
            RunInBackground(token => FlushAsync(sync, token));
        }
    }

    private async Task FlushAsync(AccountSync sync, CancellationToken token)
    {
        var result = await sync.FlushPendingAsync(token);
        foreach (var detail in result.Rejected)
        {
            Log.PendingRejected(Logger, detail);
        }
        if (result.Replayed.Count == 0)
        {
            return;
        }
        Log.PendingReplayed(Logger, result.Replayed.Count, sync.PendingCount);
        Server.NextFrame(() =>
        {
            foreach (var replayed in result.Replayed)
            {
                ApplyResult(replayed.SteamId, replayed.Result);
            }
        });
    }

    /// <summary>
    /// Na thread do jogo: aplica o nome se o jogador ainda está no servidor e entrega ou guarda
    /// as boas-vindas (se ele já saiu, ela espera o próximo connect).
    /// </summary>
    private void ApplyResult(ulong steamId, PlayerConnectResult result)
    {
        var player = Utilities.GetPlayers().FirstOrDefault(p => IsHuman(p) && p.SteamID == steamId);
        var sendNow = _welcomes?.OnConnectResult(steamId, result.IsFirstConnect, isAlive: player is not null && IsPlaying(player)) == true;
        if (player is null)
        {
            return;
        }
        _displayNames[player.Slot] = (steamId, result.DisplayName);
        ApplyName(player, result.DisplayName);
        if (sendNow)
        {
            player.PrintToChat($" {WelcomeMessage}");
        }
    }

    /// <summary>Vivo num time: já saiu da escolha de time e vê o chat.</summary>
    private static bool IsPlaying(CCSPlayerController player) =>
        player.PawnIsAlive && player.Team is CsTeam.Terrorist or CsTeam.CounterTerrorist;

    /// <summary>Placar, chat e kill feed leem o nome do controller (ADR 0008).</summary>
    private static void ApplyName(CCSPlayerController player, string name)
    {
        if (player.PlayerName == name)
        {
            return;
        }
        player.PlayerName = name;
        Utilities.SetStateChanged(player, "CBasePlayerController", "m_iszPlayerName");
    }

    private static bool IsHuman(CCSPlayerController player) =>
        player.IsValid && !player.IsBot && !player.IsHLTV && player.SteamID != 0;

    private void RunInBackground(Func<CancellationToken, Task> work)
    {
        var token = _unloading.Token;
        _ = Task.Run(async () =>
        {
            try
            {
                await work(token);
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                // Plugin descarregando.
            }
        }, token);
    }
}
