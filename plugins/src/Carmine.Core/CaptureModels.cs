using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>Um ponto do mapa, em unidades do jogo (a posição de quem matou e de quem morreu).</summary>
public sealed record Point(float X, float Y, float Z)
{
    /// <summary>Como o contrato o quer; coordenadas que não são números saem como <c>null</c> (ficam sem posição).</summary>
    public Position? ToPosition() =>
        float.IsFinite(X) && float.IsFinite(Y) && float.IsFinite(Z)
            ? new Position { X = X, Y = Y, Z = Z }
            : null;
}

/// <summary>Como foi uma kill (S17): o que o <c>player_death</c> do jogo conta além de quem matou quem.</summary>
public sealed record KillDetail(
    bool FlashAssist,
    int Penetrated,
    bool ThroughSmoke,
    bool AttackerBlind,
    bool NoScope,
    float Distance,
    Point? KillerPosition,
    Point? VictimPosition);

/// <summary>Como foi um acerto (S17): a arma, a parte do corpo e o que a armadura e a vida perderam.</summary>
public sealed record DamageDetail(string Weapon, int Hitgroup, int ArmorDamage, int HealthDamage);

/// <summary>Um jogador no fim do freeze: quem é e o valor do equipamento (<c>FreezetimeEndEquipmentValue</c>).</summary>
public sealed record RoundPlayerInfo(PlayerRef Player, int EquipmentValue);

/// <summary>O que o plugin sabe do fim do round além do vencedor: o motivo e os humanos vivos.</summary>
public sealed record RoundEndInfo(RoundEndReason Reason, IReadOnlyCollection<ulong> AliveHumans);

/// <summary>O round de coleta em andamento: o mapa jogado, o número dele no mapa e quando o freeze acabou.</summary>
internal sealed record RoundContext(Guid MapPlayId, int Number, DateTimeOffset StartedAt);

/// <summary>Traduz o <c>reason</c> do <c>round_end</c> do jogo (<c>RoundEndReason</c> do CounterStrikeSharp) para o contrato.</summary>
public static class RoundEndReasons
{
    public static RoundEndReason Map(uint gameReason) => gameReason switch
    {
        1 => RoundEndReason.Bomb_exploded, // TargetBombed
        7 => RoundEndReason.Bomb_defused, // BombDefused
        8 or 9 => RoundEndReason.Elimination, // CTsWin, TerroristsWin
        12 => RoundEndReason.Time, // TargetSaved: acabou o tempo sem a bomba
        _ => RoundEndReason.Other,
    };
}
