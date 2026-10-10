using System.Net;
using System.Text;
using Carmine.Api.Client;

namespace Carmine.Core.Tests;

/// <summary>Uma requisição como a API a recebeu (o corpo é lido antes de o HttpClient descartá-lo).</summary>
internal sealed record SentRequest(HttpMethod Method, Uri? Uri, string? Authorization, string Body);

/// <summary>Faz o papel da API: responde o que o teste mandar e guarda o que recebeu.</summary>
internal sealed class StubHandler(Func<SentRequest, HttpResponseMessage> respond) : HttpMessageHandler
{
    public static readonly CarmineApiOptions Options =
        new(new Uri("http://api.test"), ApiKey: "chave-do-servidor", Timeout: TimeSpan.FromSeconds(5));

    private readonly List<SentRequest> _requests = [];

    public IReadOnlyList<SentRequest> Requests
    {
        get
        {
            lock (_requests)
            {
                return [.. _requests];
            }
        }
    }

    public Func<SentRequest, HttpResponseMessage> Respond { get; set; } = respond;

    public static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
        var sent = new SentRequest(request.Method, request.RequestUri, request.Headers.Authorization?.ToString(), body);
        lock (_requests)
        {
            _requests.Add(sent);
        }
        return Respond(sent);
    }
}
