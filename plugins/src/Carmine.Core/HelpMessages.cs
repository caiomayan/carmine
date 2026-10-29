namespace Carmine.Core;

/// <summary>
/// <c>!help</c> / <c>!ajuda</c> (S16): os comandos do Modo deste servidor, uma linha cada, em
/// português, e no fim o caminho para as regras e os termos. Os nomes dos comandos são os que a
/// comunidade já conhece.
/// </summary>
public static class HelpMessages
{
    public const string RulesLine = "Regras e termos: stcarmine.com/rules";

    private static readonly string[] Common =
    [
        "!ws: aplica as suas skins",
        "!rank: sua posição na semana",
        "!stats: seus números da semana",
        "!rtv e !nominate: votar e indicar o próximo mapa",
        "!report: denunciar um jogador",
        "!chat off/on: esconder ou mostrar o chat dos outros",
        "!vip: até quando vai o seu VIP",
    ];

    private static readonly string[] Retake =
    [
        "!guns: escolher suas armas",
        "!awp: entrar ou sair do sorteio da AWP",
    ];

    private static readonly string[] Deathmatch =
    [
        "!guns: escolher suas armas",
        "!hs: só headshot",
        "!dmg: dano causado",
        "!hud: mensagens na tela",
        "!noprimary: sem arma primária",
    ];

    /// <summary>As linhas do <c>!help</c> do Modo do servidor (sem Vaga reservada, só as dos dois Modos).</summary>
    public static IReadOnlyList<string> Lines(ReservedSlotsMode mode)
    {
        IEnumerable<string> modeLines = mode switch
        {
            ReservedSlotsMode.Retake => Retake,
            ReservedSlotsMode.Deathmatch => Deathmatch,
            _ => [],
        };
        return [.. modeLines, .. Common, RulesLine];
    }
}
