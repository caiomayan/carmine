using Carmine.Api.Client;

namespace Carmine.Core;

public sealed record HealthProbeResult(bool Healthy, string Summary);

/// <summary>
/// Chama o health check de servidor da API (com o detalhe de cada dependência) e resume o
/// resultado numa linha de log. Nunca lança.
/// </summary>
public sealed class ApiHealthProbe(CarmineApiClient client)
{
    public async Task<HealthProbeResult> ProbeAsync(CancellationToken cancellationToken)
    {
        try
        {
            var report = await client.GetServerHealthAsync(cancellationToken).ConfigureAwait(false);
            var checks = report.Checks;
            return new(true,
                $"API no ar (Postgres {checks.Database.LatencyMs} ms, Valkey {checks.Valkey.LatencyMs} ms)");
        }
        catch (ApiException<HealthReport> unavailable)
        {
            return new(false, $"API com dependência fora do ar: {DescribeDown(unavailable.Result.Checks)}");
        }
        catch (ApiException error) when (error.StatusCode == 401)
        {
            return new(false, "API recusou a chave deste servidor: confira ApiKey na config do Carmine.Core");
        }
        catch (ApiException error)
        {
            return new(false, $"API respondeu HTTP {error.StatusCode}");
        }
        catch (HttpRequestException error)
        {
            return new(false, $"API inacessível em {client.BaseAddress}: {error.Message}");
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new(false, $"API não respondeu a tempo em {client.BaseAddress}");
        }
    }

    private static string DescribeDown(Checks checks)
    {
        var down = new List<string>();
        if (checks.Database.Status == DependencyCheckStatus.Down)
        {
            down.Add($"Postgres ({checks.Database.Error})");
        }
        if (checks.Valkey.Status == DependencyCheckStatus.Down)
        {
            down.Add($"Valkey ({checks.Valkey.Error})");
        }
        return string.Join(", ", down);
    }
}
