namespace Carmine.Core;

/// <summary>
/// O aviso "não conseguimos carregar seu Loadout" (S05). Quando a API não responde ao connect,
/// o cs2-css-inventory-simulator também não carregou o Loadout e o jogador entra com as Armas
/// padrão; ele vê o aviso no primeiro spawn (no connect ainda está na escolha de time). Só vale
/// para esta conexão. Seguro para uso por várias threads.
/// </summary>
public sealed class LoadoutNotices
{
    public const string Message = "Não conseguimos carregar seu Loadout agora; tente !ws em alguns minutos";

    private readonly Lock _lock = new();
    private readonly HashSet<ulong> _pending = [];

    /// <summary>A API respondeu (ou não) ao connect do jogador.</summary>
    public void OnConnect(ulong steamId, bool apiReachable)
    {
        lock (_lock)
        {
            if (apiReachable)
            {
                _pending.Remove(steamId);
            }
            else
            {
                _pending.Add(steamId);
            }
        }
    }

    /// <summary><c>true</c> uma única vez, se o jogador tem o aviso pendente.</summary>
    public bool TakeOnSpawn(ulong steamId)
    {
        lock (_lock)
        {
            return _pending.Remove(steamId);
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
