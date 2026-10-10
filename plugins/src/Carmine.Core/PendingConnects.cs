using System.Globalization;
using System.Text.Json;

namespace Carmine.Core;

/// <summary>Connect que a API não recebeu (estava fora do ar); reenviado quando ela voltar.</summary>
public sealed record PendingConnect(ulong SteamId, string SteamName, DateTimeOffset ConnectedAt);

/// <summary>Onde a fila de connects pendentes sobrevive a um restart do servidor.</summary>
public interface IPendingConnectsStore
{
    IReadOnlyList<PendingConnect> Load();

    void Save(IReadOnlyList<PendingConnect> connects);
}

/// <summary>
/// Fila de connects pendentes, um por jogador: reconectar enquanto a API está fora mantém o
/// horário do primeiro connect e atualiza o nome. Limitada para não crescer sem fim numa queda
/// longa (descarta o mais antigo). Segura para uso por várias threads.
/// </summary>
public sealed class PendingConnects
{
    public const int DefaultCapacity = 1000;

    private readonly Lock _lock = new();
    private readonly List<PendingConnect> _items;
    private readonly IPendingConnectsStore _store;
    private readonly int _capacity;

    public PendingConnects(IPendingConnectsStore store, int capacity = DefaultCapacity)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(capacity, 1);
        _store = store;
        _capacity = capacity;
        _items = [.. store.Load().TakeLast(capacity)];
    }

    public int Count
    {
        get
        {
            lock (_lock)
            {
                return _items.Count;
            }
        }
    }

    public void Add(PendingConnect connect)
    {
        lock (_lock)
        {
            var index = _items.FindIndex(item => item.SteamId == connect.SteamId);
            if (index >= 0)
            {
                var earliest = _items[index].ConnectedAt < connect.ConnectedAt ? _items[index].ConnectedAt : connect.ConnectedAt;
                _items[index] = connect with { ConnectedAt = earliest };
            }
            else
            {
                _items.Add(connect);
                if (_items.Count > _capacity)
                {
                    _items.RemoveAt(0);
                }
            }
            _store.Save([.. _items]);
        }
    }

    /// <summary>O connect pendente mais antigo, ou <c>null</c> com a fila vazia.</summary>
    public PendingConnect? Peek()
    {
        lock (_lock)
        {
            return _items.Count > 0 ? _items[0] : null;
        }
    }

    public void Remove(ulong steamId)
    {
        lock (_lock)
        {
            if (_items.RemoveAll(item => item.SteamId == steamId) > 0)
            {
                _store.Save([.. _items]);
            }
        }
    }

    public IReadOnlyList<PendingConnect> Snapshot()
    {
        lock (_lock)
        {
            return [.. _items];
        }
    }
}

public sealed class InMemoryPendingConnectsStore : IPendingConnectsStore
{
    private IReadOnlyList<PendingConnect> _connects = [];

    public IReadOnlyList<PendingConnect> Load() => _connects;

    public void Save(IReadOnlyList<PendingConnect> connects) => _connects = connects;
}

/// <summary>
/// Fila em JSON num arquivo da pasta do plugin. Um arquivo ilegível vira fila vazia: perder
/// connects pendentes é melhor do que o plugin não carregar.
/// </summary>
public sealed class JsonFilePendingConnectsStore(string path) : IPendingConnectsStore
{
    private sealed record Entry(string SteamId, string SteamName, DateTimeOffset ConnectedAt);

    public IReadOnlyList<PendingConnect> Load()
    {
        try
        {
            if (!File.Exists(path))
            {
                return [];
            }
            var entries = JsonSerializer.Deserialize<List<Entry>>(File.ReadAllText(path)) ?? [];
            return [.. entries.Select(e => new PendingConnect(
                ulong.Parse(e.SteamId, CultureInfo.InvariantCulture), e.SteamName, e.ConnectedAt))];
        }
        catch (Exception error) when (error is JsonException or FormatException or OverflowException or IOException)
        {
            return [];
        }
    }

    public void Save(IReadOnlyList<PendingConnect> connects)
    {
        var entries = connects.Select(c => new Entry(
            c.SteamId.ToString(CultureInfo.InvariantCulture), c.SteamName, c.ConnectedAt));
        // Escreve num temporário e troca: um crash no meio nunca deixa o arquivo pela metade.
        var temp = path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(entries));
        File.Move(temp, path, overwrite: true);
    }
}
