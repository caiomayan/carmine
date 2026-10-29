namespace Carmine.Core;

/// <summary>
/// A linha única do connect (S16): as boas-vindas ou a curiosidade que a API manda em todo connect nos
/// servidores abertos. No connect o jogador está na escolha de time e não vê o chat, então a linha
/// espera o primeiro spawn daquela conexão. Fica só na memória: perder uma linha num restart do
/// servidor não custa nada, e a próxima conexão traz outra. Segura para uso por várias threads.
/// </summary>
public sealed class PendingGreetings
{
    private readonly Lock _lock = new();
    private readonly Dictionary<ulong, string> _pending = [];

    /// <summary>
    /// A API respondeu ao connect. Devolve a linha se o jogador já está vivo num time (mostre agora);
    /// senão a guarda para o spawn. Sem linha (<c>null</c> ou vazia), não há nada a mostrar.
    /// </summary>
    public string? OnConnectResult(ulong steamId, string? greeting, bool isAlive)
    {
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(greeting))
            {
                _pending.Remove(steamId);
                return null;
            }
            if (isAlive)
            {
                _pending.Remove(steamId);
                return greeting;
            }
            _pending[steamId] = greeting;
            return null;
        }
    }

    /// <summary>O jogador nasceu: a linha guardada, uma única vez; <c>null</c> se não há.</summary>
    public string? TakeOnSpawn(ulong steamId)
    {
        lock (_lock)
        {
            return _pending.Remove(steamId, out var greeting) ? greeting : null;
        }
    }

    public void OnDisconnect(ulong steamId)
    {
        lock (_lock)
        {
            _pending.Remove(steamId);
        }
    }
}
