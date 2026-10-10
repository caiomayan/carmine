namespace Carmine.Api.Client;

/// <summary>Onde está a API e como este Servidor Carmine se identifica para ela.</summary>
public sealed record CarmineApiOptions(Uri BaseUrl, string ApiKey, TimeSpan Timeout);

/// <summary>Ponto único para os plugins criarem o cliente da API já autenticado.</summary>
public static class CarmineApi
{
    /// <summary>Cabeçalho com a chave do Servidor Carmine (ADR 0005).</summary>
    public const string ServerKeyHeader = "X-Server-Key";

    /// <param name="handler">Só para testes; em produção usa o handler padrão.</param>
    public static HttpClient CreateHttpClient(CarmineApiOptions options, HttpMessageHandler? handler = null)
    {
        var http = handler is null ? new HttpClient() : new HttpClient(handler, disposeHandler: false);
        http.BaseAddress = options.BaseUrl;
        http.Timeout = options.Timeout;
        if (!string.IsNullOrEmpty(options.ApiKey))
        {
            http.DefaultRequestHeaders.Add(ServerKeyHeader, options.ApiKey);
        }
        return http;
    }

    /// <param name="handler">Só para testes; em produção usa o handler padrão.</param>
    public static CarmineApiClient CreateClient(CarmineApiOptions options, HttpMessageHandler? handler = null) =>
        new(CreateHttpClient(options, handler));
}

public partial class CarmineApiClient
{
    /// <summary>Endereço da API usado por este cliente (para mensagens de log).</summary>
    public Uri? BaseAddress => _httpClient.BaseAddress;
}
