using CounterStrikeSharp.API.Core;

namespace Carmine.Core;

/// <summary>
/// Toda mensagem do Carmine.Core no chat sai por aqui: <c>Carmine · texto</c>, com o nome em carmim
/// (o vermelho escuro do chat do CS2) e o resto na cor padrão. Sem emoji, exclamação de propaganda
/// nem caixa alta (S16).
/// </summary>
public static class ChatMessage
{
    public const string Brand = "Carmine";

    // Mesmos valores de ChatColors.DarkRed e ChatColors.Default; literais para o teste não precisar
    // carregar o CounterStrikeSharp.API.
    private const char DarkRed = '\u0002';
    private const char Default = '\u0001';

    /// <summary>Espaço inicial: o CS2 só pinta o chat quando a linha começa com um caractere de cor.</summary>
    public static string Format(string text) => $" {DarkRed}{Brand}{Default} · {text}";

    /// <summary>Um texto de várias linhas (separadas por <c>\n</c>) sai como uma mensagem do Carmine por linha.</summary>
    public static IEnumerable<string> FormatLines(string text) => text.Split('\n').Select(Format);

    public static void SendChat(this CCSPlayerController player, string text)
    {
        foreach (var line in FormatLines(text))
        {
            player.PrintToChat(line);
        }
    }
}
