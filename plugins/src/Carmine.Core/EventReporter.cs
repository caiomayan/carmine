using System.Diagnostics.CodeAnalysis;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>
/// O que um envio de eventos resultou. <see cref="WentDown"/> e <see cref="CameBack"/> são as
/// transições da API, para o plugin logar só elas; <see cref="Dropped"/> são os eventos perdidos
/// desde o último relatório (fila cheia, ou lote que a API recusou).
/// </summary>
public sealed record EventFlushReport(int Sent, int Dropped, string? WentDown, bool CameBack, string? Rejected)
{
    public static readonly EventFlushReport Nothing = new(0, 0, null, false, null);
}

/// <summary>
/// Fila em memória dos eventos do jogo (S12) e o envio deles à API em lotes idempotentes (ADR
/// 0018). Cada evento nasce com o ID que o identifica para sempre, então o lote reenviado depois
/// de uma falha (ou de uma resposta que se perdeu no caminho) não conta duas vezes. Com a API
/// fora, os eventos esperam na fila e o envio recua (5 s, 10 s, 20 s... até 5 min); a fila cheia
/// descarta os mais antigos. Nada aqui espera a API na thread do jogo: o plugin enfileira lá e
/// manda de outra thread; uma consulta só roda por vez.
/// </summary>
[SuppressMessage("Reliability", "CA1001", Justification = "O SemaphoreSlim só segura recurso nativo se o AvailableWaitHandle for usado, e não é.")]
public sealed class EventReporter(ICarmineApiClient api, TimeProvider time, int maxQueued = EventReporter.DefaultMaxQueued, int batchSize = EventReporter.DefaultBatchSize)
{
    public const int DefaultMaxQueued = 5000;

    /// <summary>Abaixo do limite de 500 eventos da API, com folga para o tamanho do corpo.</summary>
    public const int DefaultBatchSize = 200;

    private static readonly TimeSpan FirstBackoff = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan MaxBackoff = TimeSpan.FromMinutes(5);

    private readonly object _lock = new();
    private readonly List<object> _queue = [];
    private readonly SemaphoreSlim _sending = new(1, 1);

    /// <summary>Posição (desde o início) do primeiro evento da fila: perdoa descartes durante um envio.</summary>
    private long _headPosition;
    private int _dropped;
    private int _failures;
    private bool _down;
    private DateTimeOffset _retryAt = DateTimeOffset.MinValue;

    public int Count
    {
        get
        {
            lock (_lock)
            {
                return _queue.Count;
            }
        }
    }

    public void Add(KillEvent kill) => Enqueue(kill);

    public void Add(DamageEvent damage) => Enqueue(damage);

    public void Add(RoundEndEvent roundEnd) => Enqueue(roundEnd);

    public void Add(SessionStartEvent start) => Enqueue(start);

    public void Add(SessionEndEvent end) => Enqueue(end);

    /// <summary>Tudo o que espera na fila, na ordem em que aconteceu (para testes e diagnóstico).</summary>
    public EventBatch Snapshot()
    {
        lock (_lock)
        {
            return ToBatch(_queue);
        }
    }

    /// <summary>
    /// Manda a fila à API, um lote por vez, até esvaziar ou a API falhar. Em recuo, não faz nada;
    /// <paramref name="final"/> (o plugin descarregando) ignora o recuo e faz uma tentativa só.
    /// Nunca lança por falha da API.
    /// </summary>
    public Task<EventFlushReport> FlushAsync(CancellationToken cancellationToken) => FlushAsync(final: false, cancellationToken);

    /// <inheritdoc cref="FlushAsync(CancellationToken)"/>
    public async Task<EventFlushReport> FlushAsync(bool final, CancellationToken cancellationToken)
    {
        await _sending.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            return await FlushLockedAsync(final, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _sending.Release();
        }
    }

    private async Task<EventFlushReport> FlushLockedAsync(bool final, CancellationToken cancellationToken)
    {
        var sent = 0;
        string? wentDown = null;
        var cameBack = false;
        string? rejected = null;
        while (final || time.GetUtcNow() >= _retryAt)
        {
            var (items, position) = Peek();
            if (items.Count == 0)
            {
                break;
            }
            try
            {
                await api.SendGameEventsAsync(ToBatch(items), cancellationToken).ConfigureAwait(false);
            }
            catch (ApiException error) when (error.StatusCode is 400 or 413)
            {
                // Um lote que a API nunca vai aceitar travaria a fila para sempre.
                Remove(items.Count, position, rejectedBatch: true);
                rejected = $"API recusou {items.Count} evento(s) com HTTP {error.StatusCode}";
                continue;
            }
            catch (Exception error) when (IsApiFailure(error, cancellationToken))
            {
                _failures++;
                _retryAt = time.GetUtcNow() + Backoff(_failures);
                if (!_down)
                {
                    _down = true;
                    wentDown = Describe(error);
                }
                break;
            }
            Remove(items.Count, position, rejectedBatch: false);
            sent += items.Count;
            _failures = 0;
            if (_down)
            {
                _down = false;
                cameBack = true;
            }
            if (final)
            {
                break;
            }
        }
        return new EventFlushReport(sent, Interlocked.Exchange(ref _dropped, 0), wentDown, cameBack, rejected);
    }

    private void Enqueue(object item)
    {
        lock (_lock)
        {
            _queue.Add(item);
            var overflow = _queue.Count - maxQueued;
            if (overflow > 0)
            {
                _queue.RemoveRange(0, overflow);
                _headPosition += overflow;
                Interlocked.Add(ref _dropped, overflow);
            }
        }
    }

    private (List<object> Items, long Position) Peek()
    {
        lock (_lock)
        {
            return ([.. _queue.Take(batchSize)], _headPosition);
        }
    }

    /// <summary>Tira da fila o lote que acabou de sair, descontando o que a fila cheia já descartou.</summary>
    private void Remove(int count, long position, bool rejectedBatch)
    {
        lock (_lock)
        {
            var alreadyGone = _headPosition - position;
            var toRemove = (int)Math.Min(Math.Max(count - alreadyGone, 0), _queue.Count);
            _queue.RemoveRange(0, toRemove);
            _headPosition += toRemove;
            if (rejectedBatch)
            {
                Interlocked.Add(ref _dropped, toRemove);
            }
        }
    }

    private static EventBatch ToBatch(IEnumerable<object> items)
    {
        var batch = new EventBatch();
        foreach (var item in items)
        {
            switch (item)
            {
                case KillEvent kill:
                    batch.Kills.Add(kill);
                    break;
                case DamageEvent damage:
                    batch.Damages.Add(damage);
                    break;
                case RoundEndEvent roundEnd:
                    batch.RoundEnds.Add(roundEnd);
                    break;
                case SessionStartEvent start:
                    batch.SessionStarts.Add(start);
                    break;
                case SessionEndEvent end:
                    batch.SessionEnds.Add(end);
                    break;
            }
        }
        return batch;
    }

    private static TimeSpan Backoff(int failures) =>
        failures >= 7 ? MaxBackoff : TimeSpan.FromTicks(Math.Min(FirstBackoff.Ticks << (failures - 1), MaxBackoff.Ticks));

    /// <summary>Cancelamento pedido por nós (plugin descarregando) não conta.</summary>
    private static bool IsApiFailure(Exception error, CancellationToken cancellationToken) => error switch
    {
        ApiException or HttpRequestException => true,
        TaskCanceledException => !cancellationToken.IsCancellationRequested,
        _ => false,
    };

    private static string Describe(Exception error) => error switch
    {
        ApiException api => $"API respondeu HTTP {api.StatusCode}",
        TaskCanceledException => "API não respondeu a tempo",
        _ => $"API inacessível: {error.Message}",
    };
}
