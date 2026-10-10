using System.Net.Http.Headers;

namespace Carmine.Api.Client;

/// <summary>Onde está a API e como este Servidor Carmine se identifica para ela.</summary>
public sealed record CarmineApiOptions(Uri BaseUrl, string ApiKey, TimeSpan Timeout);

/// <summary>Ponto único para os plugins criarem o cliente da API já autenticado.</summary>
public static class CarmineApi
{
    /// <summary>
    /// A chave do Servidor Carmine vai em <c>Authorization: Bearer &lt;chave&gt;</c> (ADR 0005);
    /// gere-a com <c>pnpm --filter @carmine/api servers create</c>.
    /// </summary>
    public const string AuthenticationScheme = "Bearer";

    /// <param name="handler">Só para testes; em produção usa o handler padrão.</param>
    public static HttpClient CreateHttpClient(CarmineApiOptions options, HttpMessageHandler? handler = null)
    {
        var http = handler is null ? new HttpClient() : new HttpClient(handler, disposeHandler: false);
        http.BaseAddress = options.BaseUrl;
        http.Timeout = options.Timeout;
        if (!string.IsNullOrEmpty(options.ApiKey))
        {
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(AuthenticationScheme, options.ApiKey);
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

    /// <summary>
    /// Campo opcional vazio fica fora do JSON: os contratos (Zod) aceitam o campo ausente, não
    /// <c>null</c>.
    /// </summary>
    static partial void UpdateJsonSerializerSettings(System.Text.Json.JsonSerializerOptions settings) =>
        settings.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
}
