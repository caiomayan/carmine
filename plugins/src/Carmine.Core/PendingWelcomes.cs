using System.Globalization;
using System.Text.Json;

namespace Carmine.Core;

/// <summary>Onde as boas-vindas ainda não entregues sobrevivem a um restart do servidor.</summary>
public interface IPendingWelcomesStore
{
    IReadOnlyList<ulong> Load();

    void Save(IReadOnlyList<ulong> steamIds);
}

/// <summary>
/// Boas-vindas do primeiro connect que ainda não chegaram ao jogador. No connect o jogador está
/// na escolha de time e não vê o chat, então a mensagem espera o primeiro spawn. A API só diz
/// "primeiro connect" uma vez: se o jogador sai antes de nascer (ou o connect veio da fila com
/// ele já fora), é aqui que ela fica guardada até um spawn num connect futuro. Limitada para
/// não crescer sem fim (descarta a mais antiga). Segura para uso por várias threads.
/// </summary>
public sealed class PendingWelcomes
{
    public const int DefaultCapacity = 1000;

    private readonly Lock _lock = new();
    private readonly List<ulong> _steamIds;
    private readonly IPendingWelcomesStore _store;
    private readonly int _capacity;

    public PendingWelcomes(IPendingWelcomesStore store, int capacity = DefaultCapacity)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(capacity, 1);
        _store = store;
        _capacity = capacity;
        _steamIds = [.. store.Load().Distinct().TakeLast(capacity)];
    }

    /// <summary>
    /// A API respondeu ao connect. <c>true</c>: mande as boas-vindas agora (o jogador já está
    /// vivo no jogo). Senão, se for o primeiro connect, ela fica guardada para o spawn.
    /// </summary>
    public bool OnConnectResult(ulong steamId, bool isFirstConnect, bool isAlive)
    {
        lock (_lock)
        {
            if (isAlive && (isFirstConnect || _steamIds.Contains(steamId)))
            {
                Remove(steamId);
                return true;
            }
            if (isFirstConnect && !_steamIds.Contains(steamId))
            {
                _steamIds.Add(steamId);
                if (_steamIds.Count > _capacity)
                {
                    _steamIds.RemoveAt(0);
                }
                _store.Save([.. _steamIds]);
            }
            return false;
        }
    }

    /// <summary>O jogador nasceu: <c>true</c> se ele tem boas-vindas a receber (e ela sai da lista).</summary>
    public bool TakeOnSpawn(ulong steamId)
    {
        lock (_lock)
        {
            return Remove(steamId);
        }
    }

    private bool Remove(ulong steamId)
    {
        if (!_steamIds.Remove(steamId))
        {
            return false;
        }
        _store.Save([.. _steamIds]);
        return true;
    }
}

public sealed class InMemoryPendingWelcomesStore : IPendingWelcomesStore
{
    private IReadOnlyList<ulong> _steamIds = [];

    public IReadOnlyList<ulong> Load() => _steamIds;

    public void Save(IReadOnlyList<ulong> steamIds) => _steamIds = steamIds;
}

/// <summary>
/// Lista em JSON na pasta de dados do plugin. Um arquivo ilegível vira lista vazia: perder uma
/// boas-vindas é melhor do que o plugin não carregar.
/// </summary>
public sealed class JsonFilePendingWelcomesStore(string path) : IPendingWelcomesStore
{
    public IReadOnlyList<ulong> Load()
    {
        try
        {
            if (!File.Exists(path))
            {
                return [];
            }
            var entries = JsonSerializer.Deserialize<List<string>>(File.ReadAllText(path)) ?? [];
            return [.. entries.Select(e => ulong.Parse(e, CultureInfo.InvariantCulture))];
        }
        catch (Exception error) when (error is JsonException or FormatException or OverflowException or IOException)
        {
            return [];
        }
    }

    public void Save(IReadOnlyList<ulong> steamIds)
    {
        var entries = steamIds.Select(id => id.ToString(CultureInfo.InvariantCulture));
        // Escreve num temporário e troca: um crash no meio nunca deixa o arquivo pela metade.
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(entries));
        File.Move(temp, path, overwrite: true);
    }
}
