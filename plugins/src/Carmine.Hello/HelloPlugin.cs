using Carmine.Api.Client;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes;
using Microsoft.Extensions.Logging;

namespace Carmine.Hello;

[MinimumApiVersion(376)]
public sealed class HelloPlugin : BasePlugin, IPluginConfig<HelloConfig>
{
    private HttpClient? _http;

    public override string ModuleName => "Carmine.Hello";
    public override string ModuleVersion => "0.1.0";
    public override string ModuleAuthor => "Carmine";
    public override string ModuleDescription => "Verifica, ao carregar, se a API da Carmine está no ar.";

    public HelloConfig Config { get; set; } = new();

    public void OnConfigParsed(HelloConfig config)
    {
        if (!Uri.TryCreate(config.ApiBaseUrl, UriKind.Absolute, out _))
        {
            throw new ArgumentException($"ApiBaseUrl inválida: '{config.ApiBaseUrl}'", nameof(config));
        }
        if (config.TimeoutSeconds <= 0)
        {
            throw new ArgumentException("TimeoutSeconds deve ser maior que zero", nameof(config));
        }
        Config = config;
    }

    public override void Load(bool hotReload)
    {
        var options = new CarmineApiOptions(
            new Uri(Config.ApiBaseUrl),
            Config.ApiKey,
            TimeSpan.FromSeconds(Config.TimeoutSeconds));
        _http = CarmineApi.CreateHttpClient(options);
        var probe = new ApiHealthProbe(new CarmineApiClient(_http));

        // Fora da thread do jogo: a chamada HTTP não pode travar o tick do servidor.
        _ = Task.Run(async () =>
        {
            var result = await probe.ProbeAsync(CancellationToken.None);
            if (result.Healthy)
            {
                Log.ApiHealthy(Logger, result.Summary);
            }
            else
            {
                Log.ApiUnhealthy(Logger, result.Summary);
            }
        });
    }

    public override void Unload(bool hotReload)
    {
        _http?.Dispose();
        _http = null;
    }
}
