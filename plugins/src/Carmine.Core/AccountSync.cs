using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>O que aconteceu com o connect de um jogador.</summary>
public abstract record ConnectOutcome
{
    /// <summary>A API registrou o connect: aplicar o Nome de exibição (e as boas-vindas, se for o primeiro).</summary>
    public sealed record Synced(PlayerConnectResult Result) : ConnectOutcome;

    /// <summary>A API está fora: o jogador joga com o nome Steam e o connect fica na fila.</summary>
    public sealed record Queued(string Reason) : ConnectOutcome;

    /// <summary>A API recusou os dados (não adianta reenviar).</summary>
    public sealed record Rejected(string Reason) : ConnectOutcome;
}

/// <summary>Connect da fila que a API aceitou quando voltou.</summary>
public sealed record ReplayedConnect(ulong SteamId, PlayerConnectResult Result);

public sealed record FlushResult(IReadOnlyList<ReplayedConnect> Replayed, IReadOnlyList<string> Rejected);

/// <summary>
/// Leva os connects dos jogadores à API, que cria a Conta no primeiro (ADR 0007). Se a API
/// estiver fora, o connect vai para a fila e é reenviado por <see cref="FlushPendingAsync"/>.
/// Nunca lança por falha da API; roda fora da thread do jogo.
/// </summary>
public sealed class AccountSync(ICarmineApiClient api, PendingConnects pending, TimeProvider time)
{
    private int _flushing;

    public int PendingCount => pending.Count;

    public async Task<ConnectOutcome> ConnectAsync(ulong steamId, string steamName, CancellationToken cancellationToken)
    {
        var connectedAt = time.GetUtcNow();
        try
        {
            var result = await SendAsync(steamId, steamName, connectedAt: null, cancellationToken).ConfigureAwait(false);
            // A Conta já existe; um connect antigo da fila não acrescentaria nada.
            pending.Remove(steamId);
            return new ConnectOutcome.Synced(result);
        }
        catch (ApiException error) when (IsRejection(error))
        {
            return new ConnectOutcome.Rejected(Describe(error));
        }
        catch (Exception error) when (IsTransient(error, cancellationToken))
        {
            pending.Add(new PendingConnect(steamId, steamName, connectedAt));
            return new ConnectOutcome.Queued(Describe(error));
        }
    }

    /// <summary>
    /// Reenvia a fila em ordem, parando na primeira falha transitória (a API caiu de novo).
    /// Chamadas simultâneas não se sobrepõem: a segunda volta vazia.
    /// </summary>
    public async Task<FlushResult> FlushPendingAsync(CancellationToken cancellationToken)
    {
        if (Interlocked.Exchange(ref _flushing, 1) == 1)
        {
            return new FlushResult([], []);
        }
        try
        {
            var replayed = new List<ReplayedConnect>();
            var rejected = new List<string>();
            while (pending.Peek() is { } next)
            {
                try
                {
                    var result = await SendAsync(next.SteamId, next.SteamName, next.ConnectedAt, cancellationToken)
                        .ConfigureAwait(false);
                    pending.Remove(next.SteamId);
                    replayed.Add(new ReplayedConnect(next.SteamId, result));
                }
                catch (ApiException error) when (IsRejection(error))
                {
                    pending.Remove(next.SteamId);
                    rejected.Add($"{next.SteamId}: {Describe(error)}");
                }
                catch (Exception error) when (IsTransient(error, cancellationToken))
                {
                    break;
                }
            }
            return new FlushResult(replayed, rejected);
        }
        finally
        {
            Volatile.Write(ref _flushing, 0);
        }
    }

    private Task<PlayerConnectResult> SendAsync(
        ulong steamId, string steamName, DateTimeOffset? connectedAt, CancellationToken cancellationToken) =>
        api.RegisterPlayerConnectAsync(
            new PlayerConnect
            {
                SteamId = steamId.ToString(CultureInfo.InvariantCulture),
                SteamName = steamName,
                ConnectedAt = connectedAt,
            },
            cancellationToken);

    /// <summary>Dados inválidos: reenviar daria o mesmo erro.</summary>
    private static bool IsRejection(ApiException error) => error.StatusCode is 400 or 422;

    /// <summary>
    /// API fora, lenta ou mal configurada (401 com a chave errada): vale guardar e tentar de novo.
    /// Cancelamento pedido por nós (plugin descarregando) não conta.
    /// </summary>
    private static bool IsTransient(Exception error, CancellationToken cancellationToken) => error switch
    {
        ApiException api => !IsRejection(api),
        HttpRequestException => true,
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
