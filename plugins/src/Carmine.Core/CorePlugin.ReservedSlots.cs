using Carmine.Api.Client;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;
using CounterStrikeSharp.API.ValveConstants.Protobuf;
using Microsoft.Extensions.Logging;

namespace Carmine.Core;

/// <summary>
/// A Vaga reservada no jogo (S14; regras em <see cref="ReservedSlots"/>). O maxplayers do
/// servidor fica acima de <see cref="CoreConfig.PublicSlots"/> (Retake: 10 para 9; Deathmatch: 18
/// para 16) e quem entra além das vagas públicas só fica se a API disser que é VIP. No Retake, o
/// VIP espera na fila do cs2-retakes e, no fim do round, um jogador sem VIP sai; o cs2-retakes põe
/// o VIP no jogo no round_prestart seguinte, por isso o retakes.cfg tem mp_round_restart_delay
/// maior que <see cref="RoundEndRemovalDelaySeconds"/>.
/// </summary>
public sealed partial class CorePlugin
{
    /// <summary>No fim do round: tempo para ler a mensagem antes de sair, antes do próximo round.</summary>
    private const float RoundEndRemovalDelaySeconds = 3.0f;

    /// <summary>De quanto em quanto tempo a posição e a mira dos vivos são amostradas (AFK).</summary>
    private const float PoseSampleSeconds = 2.0f;

    private ReservedSlots? _reservedSlots;
    private VacancyFinder? _vacancies;
    /// <summary>O outro servidor com vaga, buscado quando alguém vai sair (só na thread do jogo).</summary>
    private string? _vacancy;
    private bool _capacityChecked;

    private GameMode VacancyMode => Config.ReservedSlotsMode == ReservedSlotsMode.Deathmatch
        ? GameMode.Deathmatch
        : GameMode.Retake;

    /// <summary>
    /// No boot a frio o Load roda antes das globais do jogo: o maxplayers e a lista de jogadores
    /// só existem a partir do primeiro mapa (<see cref="CheckReservedSlotsCapacity"/>) ou, no hot
    /// reload, já.
    /// </summary>
    private void LoadReservedSlots(ICarmineApiClient client, bool hotReload)
    {
        var mode = Config.ReservedSlotsMode;
        if (mode == ReservedSlotsMode.Off)
        {
            return;
        }
        _reservedSlots = new ReservedSlots(mode, Config.PublicSlots, TimeProvider.System);
        _vacancies = new VacancyFinder(client);
        if (mode == ReservedSlotsMode.Retake)
        {
            RegisterEventHandler<EventRoundEnd>(OnRoundEndReservedSlots);
            AddTimer(PoseSampleSeconds, SamplePoses, TimerFlags.REPEAT);
        }
        if (hotReload)
        {
            CheckReservedSlotsCapacity();
            foreach (var player in Utilities.GetPlayers().Where(IsHuman))
            {
                _reservedSlots.OnJoin(player.SteamID);
            }
        }
    }

    /// <summary>Uma vez, com as globais do jogo prontas: avisa se o maxplayers não deixa vaga extra.</summary>
    private void CheckReservedSlotsCapacity()
    {
        if (_reservedSlots is null || _capacityChecked)
        {
            return;
        }
        _capacityChecked = true;
        ReservedSlotsLog.Enabled(Logger, Config.ReservedSlotsMode, Config.PublicSlots, Server.MaxPlayers);
        if (Server.MaxPlayers <= Config.PublicSlots)
        {
            ReservedSlotsLog.NoRoom(Logger, Server.MaxPlayers, Config.PublicSlots);
        }
    }

    /// <summary>
    /// Na thread do jogo, com a resposta da API ao connect: tira já quem ocupou a vaga extra sem
    /// VIP e, no Retake, avisa o VIP que vai esperar o fim do round. Devolve se ele vai sair.
    /// </summary>
    private bool LeavesForReservedSlot(CCSPlayerController player, bool isVip)
    {
        if (_reservedSlots is not { } slots)
        {
            return false;
        }
        var humans = ConnectedHumans();
        if (slots.OnConnectResult(player.SteamID, isVip, humans.Count))
        {
            var steamId = player.SteamID;
            ReservedSlotsLog.Full(Logger, steamId, humans.Count, Config.PublicSlots);
            _kicking.Add(steamId);
            FindVacancy(vacancy => RemoveForReservedSlot(steamId, ReservedSlots.FullMessage(vacancy), KickDelaySeconds));
            return true;
        }
        if (isVip && slots.HasVipWaiting(humans))
        {
            player.SendChat(ReservedSlots.QueuedVipMessage);
            FindVacancy(vacancy => _vacancy = vacancy);
        }
        return false;
    }

    /// <summary>Retake: no fim do round, sai quem abre a vaga dos VIPs que esperam.</summary>
    private HookResult OnRoundEndReservedSlots(EventRoundEnd @event, GameEventInfo info)
    {
        if (_reservedSlots is not { } slots)
        {
            return HookResult.Continue;
        }
        var players = Utilities.GetPlayers()
            .Where(p => IsHuman(p) && p.Connected == PlayerConnectedState.Connected)
            .Select(p => new SlotPlayer(p.SteamID, p.Team is not (CsTeam.Terrorist or CsTeam.CounterTerrorist)))
            .ToList();
        foreach (var removal in slots.OnRoundEnd(players, _vacancy))
        {
            ReservedSlotsLog.Removed(Logger, removal.SteamId);
            _kicking.Add(removal.SteamId);
            RemoveForReservedSlot(removal.SteamId, removal.Message, RoundEndRemovalDelaySeconds);
        }
        return HookResult.Continue;
    }

    /// <summary>Mostra a mensagem no chat, no centro e no console e tira o jogador depois de <paramref name="delay"/> s.</summary>
    private void RemoveForReservedSlot(ulong steamId, string message, float delay)
    {
        var player = Utilities.GetPlayers().FirstOrDefault(p => IsHuman(p) && p.SteamID == steamId);
        if (player is null)
        {
            _kicking.Remove(steamId);
            return;
        }
        player.SendChat(message);
        player.PrintToCenter(message);
        player.PrintToConsole($"[Carmine] {message}");
        AddTimer(delay, () =>
        {
            _kicking.Remove(steamId);
            var current = Utilities.GetPlayers().FirstOrDefault(p => IsHuman(p) && p.SteamID == steamId);
            current?.Disconnect(NetworkDisconnectionReason.NETWORK_DISCONNECT_KICKED);
        });
    }

    /// <summary>Busca outro servidor com vaga fora da thread do jogo e volta a ela com o resultado (ou nulo).</summary>
    private void FindVacancy(Action<string?> then)
    {
        if (_vacancies is not { } vacancies)
        {
            then(null);
            return;
        }
        var mode = VacancyMode;
        RunInBackground(async token =>
        {
            var vacancy = await vacancies.FindAsync(mode, token);
            Server.NextFrame(() => then(vacancy));
        });
    }

    /// <summary>AFK: posição e mira de quem está vivo num time.</summary>
    private void SamplePoses()
    {
        if (_reservedSlots is not { } slots)
        {
            return;
        }
        foreach (var player in Utilities.GetPlayers())
        {
            if (!IsHuman(player) || !IsPlaying(player) || player.PlayerPawn.Value is not { } pawn
                || pawn.AbsOrigin is not { } origin)
            {
                continue;
            }
            var angles = pawn.EyeAngles;
            slots.RecordPose(player.SteamID, new PlayerPose(origin.X, origin.Y, origin.Z, angles.X, angles.Y));
        }
    }

    private static List<ulong> ConnectedHumans() => Utilities.GetPlayers()
        .Where(p => IsHuman(p) && p.Connected == PlayerConnectedState.Connected)
        .Select(p => p.SteamID)
        .Distinct()
        .ToList();
}

internal static partial class ReservedSlotsLog
{
    [LoggerMessage(Level = LogLevel.Information,
        Message = "Carmine.Core: Vaga reservada ({Mode}): {PublicSlots} vagas públicas, maxplayers {MaxPlayers}")]
    public static partial void Enabled(ILogger logger, ReservedSlotsMode mode, int publicSlots, int maxPlayers);

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "Carmine.Core: maxplayers {MaxPlayers} não passa das {PublicSlots} vagas públicas: nenhum VIP consegue usar a Vaga reservada")]
    public static partial void NoRoom(ILogger logger, int maxPlayers, int publicSlots);

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Carmine.Core: {SteamId} sem VIP na vaga extra ({Humans} de {PublicSlots}); saindo")]
    public static partial void Full(ILogger logger, ulong steamId, int humans, int publicSlots);

    [LoggerMessage(Level = LogLevel.Information, Message = "Carmine.Core: {SteamId} sai no fim do round para abrir a vaga de um VIP")]
    public static partial void Removed(ILogger logger, ulong steamId);
}
