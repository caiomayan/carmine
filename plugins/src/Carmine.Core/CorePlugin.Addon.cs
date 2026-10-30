using Carmine.Api.Client;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Admin;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Extensions;
using CounterStrikeSharp.API.Modules.Utils;

namespace Carmine.Core;

/// <summary>
/// O addon do Workshop dos servidores abertos (S19): o card de boas-vindas em Panorama (<c>custom_hud_layout</c>)
/// e o logo do Carmine em algumas paredes (<c>env_decal</c>). Tudo isto só roda com <c>AddonEnabled</c> (o
/// <c>prestart.sh</c> o liga só nos perfis abertos e com o item publicado); a chave de emergência
/// (<c>CARMINE_ADDON_ENABLED=0</c>) o desliga sem novo release. A parte que depende do jogo está toda aqui, em
/// métodos pequenos, para o teste no jogo ajustar sem mexer no resto. O que dá para testar sem o jogo fica em
/// <see cref="AddonCard"/>, <see cref="WelcomeCard"/> e <see cref="WallLogos"/>.
/// </summary>
public sealed partial class CorePlugin
{
    private WelcomeCard? _welcome;
    private CCSCustomHudLayout? _cardLayout;
    private WallLogos _wallLogos = WallLogos.Empty;
    private readonly List<CEnvDecal> _wallDecals = [];

    private void LoadAddon(ICarmineApiClient client, bool hotReload)
    {
        if (!Config.AddonEnabled)
        {
            return;
        }
        _welcome = new WelcomeCard(client);
        _wallLogos = ReadWallLogos();
        RegisterListener<Listeners.OnMapStart>(_ => Server.NextFrame(PlaceAddonEntities));
        RegisterEventHandler<EventRoundStart>(OnRoundStartAddon);
        AddCommand("css_carmine_logo_here", "Imprime o ponto de parede a 1 metro à frente, para colar no wall-logos.json (só @css/root)", OnWallLogoHereCommand);
        if (hotReload)
        {
            Server.NextFrame(PlaceAddonEntities);
        }
    }

    private void UnloadAddon()
    {
        RemoveWallDecals();
        if (_cardLayout is { IsValid: true } layout)
        {
            layout.Remove();
        }
        _cardLayout = null;
        _welcome = null;
    }

    private WallLogos ReadWallLogos()
    {
        var path = Path.Combine(Server.GameDirectory, "csgo", "cfg", "carmine", "wall-logos.json");
        var logos = WallLogos.Parse(File.Exists(path) ? File.ReadAllText(path) : null, out var error);
        if (error is not null)
        {
            Logger.LogWarning("wall-logos.json inválido, sem logo nas paredes: {Error}", error);
        }
        return logos;
    }

    private void PlaceAddonEntities()
    {
        CreateCardLayout();
        PlaceWallLogos();
    }

    private HookResult OnRoundStartAddon(EventRoundStart @event, GameEventInfo info)
    {
        // Os decals podem sumir no reinício do round: confere e recoloca só se faltar algum.
        if (_wallDecals.Count == 0 || _wallDecals.Any(decal => !decal.IsValid))
        {
            Server.NextFrame(PlaceWallLogos);
        }
        return HookResult.Continue;
    }

    /// <summary>
    /// Cria a entidade do card (uma para todos; o texto e a classe valem por jogador). O layout vem do addon, então
    /// o addon precisa estar montado no servidor (<c>mm_extra_addons</c>); sem ele a entidade nasce vazia e o
    /// cliente não mostra nada. ESCOLHA QUE O JOGO CONFIRMA: <c>m_strLayout</c> + <c>SetStateChanged</c> no lugar
    /// do <c>StrLayoutUpdated()</c> do SwiftlyS2 (o CounterStrikeSharp não tem esse método).
    /// </summary>
    private void CreateCardLayout()
    {
        if (_cardLayout is { IsValid: true })
        {
            return;
        }
        var layout = Utilities.CreateEntityByName<CCSCustomHudLayout>("custom_hud_layout");
        if (layout is null)
        {
            Logger.LogWarning("Não consegui criar o custom_hud_layout; o card não aparece.");
            return;
        }
        layout.StrLayout = AddonCard.LayoutResource;
        Utilities.SetStateChanged(layout, "CCSCustomHudLayout", "m_strLayout");
        layout.DispatchSpawn();
        _cardLayout = layout;
    }

    /// <summary>Mostra o card ao jogador por <see cref="CoreConfig.CardSeconds"/> s; os textos vêm da API.</summary>
    private void ShowWelcomeCard(CCSPlayerController player)
    {
        if (_welcome is not { } welcome)
        {
            return;
        }
        var steamId = player.SteamID;
        var slot = player.Slot;
        var fallbackName = player.PlayerName;
        RunInBackground(async token =>
        {
            var card = await welcome.FetchAsync(steamId, token) ?? AddonCard.OnlyName(fallbackName);
            Server.NextFrame(() => PresentCard(slot, steamId, card));
        });
    }

    private void PresentCard(int slot, ulong steamId, PlayerCard card)
    {
        var player = Utilities.GetPlayerFromSlot(slot);
        if (player is null || !IsHuman(player) || player.SteamID != steamId
            || _cardLayout is not { IsValid: true } layout)
        {
            return;
        }
        foreach (var (variable, value) in AddonCard.VariablesFor(card))
        {
            layout.SetDialogVariableStringForPlayer(player, AddonCard.PanelId, variable, value);
        }
        layout.SetHasClassForPlayer(player, AddonCard.PanelId, AddonCard.HiddenClass, false);
        AddTimer(Config.CardSeconds, () => HideCard(slot, steamId));
    }

    private void HideCard(int slot, ulong steamId)
    {
        var player = Utilities.GetPlayerFromSlot(slot);
        if (player is null || !IsHuman(player) || player.SteamID != steamId
            || _cardLayout is not { IsValid: true } layout)
        {
            return;
        }
        layout.SetHasClassForPlayer(player, AddonCard.PanelId, AddonCard.HiddenClass, true);
    }

    /// <summary>
    /// Põe o logo nos pontos do mapa. Mesma técnica do CS2-Poor-MapAdvertisements: um <c>env_decal</c> projetado no
    /// mundo com o material do addon. ESCOLHA QUE O JOGO CONFIRMA: o material e o tamanho/profundidade do decal.
    /// </summary>
    private void PlaceWallLogos()
    {
        RemoveWallDecals();
        foreach (var point in _wallLogos.For(Server.MapName))
        {
            using var keyValues = new CEntityKeyValues();
            var decal = Utilities.CreateEntityByName<CEnvDecal>("env_decal");
            if (decal is null)
            {
                continue;
            }
            keyValues.SetString("material", Config.WallLogoMaterial);
            decal.Width = point.Width;
            decal.Height = point.Height;
            decal.Depth = 12;
            decal.RenderOrder = 1;
            decal.RenderMode = RenderMode_t.kRenderNormal;
            decal.ProjectOnWorld = true;
            decal.Teleport(new Vector(point.X, point.Y, point.Z), new QAngle(point.Pitch, point.Yaw, point.Roll));
            decal.DispatchSpawn(keyValues);
            _wallDecals.Add(decal);
        }
    }

    private void RemoveWallDecals()
    {
        foreach (var decal in _wallDecals.Where(decal => decal.IsValid))
        {
            decal.Remove();
        }
        _wallDecals.Clear();
    }

    /// <summary>
    /// Ferramenta de desenvolvimento para achar os pontos do <c>wall-logos.json</c> dentro do jogo: imprime a linha
    /// do ponto a <c>distância</c> unidades à frente dos olhos de quem digitou (padrão 100). Só para quem tem
    /// <c>@css/root</c>. O decal projeta na parede à frente; ajuste a distância até o logo cair na parede.
    /// </summary>
    private void OnWallLogoHereCommand(CCSPlayerController? player, CommandInfo info)
    {
        if (player is null || !IsHuman(player) || !AdminManager.PlayerHasPermissions(player, "@css/root"))
        {
            return;
        }
        var pawn = player.PlayerPawn.Value;
        var origin = pawn?.AbsOrigin;
        if (pawn is null || origin is null)
        {
            return;
        }
        var distance = info.ArgCount > 1 && float.TryParse(info.GetArg(1), System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : 100f;
        var eye = pawn.EyeAngles;
        var pitch = eye.X * MathF.PI / 180f;
        var yaw = eye.Y * MathF.PI / 180f;
        var forward = (X: MathF.Cos(pitch) * MathF.Cos(yaw), Y: MathF.Cos(pitch) * MathF.Sin(yaw), Z: -MathF.Sin(pitch));
        const float eyeHeight = 64f;
        var point = new WallLogoPoint(
            origin.X + forward.X * distance,
            origin.Y + forward.Y * distance,
            origin.Z + eyeHeight + forward.Z * distance,
            Pitch: 90f,
            Yaw: (eye.Y + 180f) % 360f);
        var line = $"\"{Server.MapName}\": [ {WallLogos.Describe(point)} ]";
        player.PrintToConsole(line);
        player.SendChat($"Ponto de parede impresso no seu console ({Server.MapName}).");
    }
}
