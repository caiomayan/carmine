namespace Carmine.Core;

/// <summary>
/// O que do chat vai para o log (S13, ADR 0019): tudo o que o jogador disse e os outros veem. Ficam
/// de fora os comandos silenciosos (<c>/algo</c>, que ninguém lê) e os comandos do próprio
/// Carmine.Core (<c>!report</c> e <c>!chat</c>), que são só ruído e números do menu. Mensagem que
/// o <c>!chat off</c> de outro jogador esconde continua no log: ele registra o que foi dito, e não
/// quem leu.
/// </summary>
public static class ChatLogFilter
{
    /// <summary>Acima disto a API recusa o lote inteiro (limite do contrato).</summary>
    public const int MaxLength = 256;

    private static readonly string[] OwnCommands = ["!report", "!denunciar", "!chat"];

    /// <summary>O texto a registrar, ou <c>null</c> se a mensagem não entra no log.</summary>
    public static string? Clean(string? text)
    {
        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed) || trimmed[0] == '/')
        {
            return null;
        }
        var firstWord = trimmed.Split(' ', 2)[0];
        if (OwnCommands.Contains(firstWord, StringComparer.OrdinalIgnoreCase))
        {
            return null;
        }
        if (trimmed.Length <= MaxLength)
        {
            return trimmed;
        }
        // Não corta um par substituto ao meio: o JSON do lote ficaria inválido.
        var end = char.IsHighSurrogate(trimmed[MaxLength - 1]) ? MaxLength - 1 : MaxLength;
        return trimmed[..end];
    }
}
