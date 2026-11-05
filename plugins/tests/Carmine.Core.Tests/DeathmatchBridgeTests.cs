using Xunit;

namespace Carmine.Core.Tests;

/// <summary>
/// O caminho de reflexão da ponte com o Deathmatch patchado, contra APIs falsas que têm os mesmos membros públicos
/// que o patch põe na <c>IDeathmatchAPI</c> (o jogador é um <see cref="object"/> aqui; no jogo, um CCSPlayerController).
/// </summary>
public class DeathmatchBridgeTests
{
    private interface IFakeEvents;

    private sealed record OnPlayerPreferenceChanged(object player, string name, object value) : IFakeEvents;

    private sealed record OtherEvent : IFakeEvents;

    private sealed class PatchedApi
    {
        private EventHandler<IFakeEvents>? _handlers;

        public List<(object Player, string Name, object Value)> Sets { get; } = [];

        public bool SetResult { get; set; } = true;

        public Exception? SetThrows { get; set; }

        public int Handlers => _handlers?.GetInvocationList().Length ?? 0;

        public event EventHandler<IFakeEvents>? DeathmatchEventHandlers
        {
            add => _handlers += value;
            remove => _handlers -= value;
        }

        public bool SetPlayerPreference(object player, string name, object value)
        {
            if (SetThrows is not null)
            {
                throw SetThrows;
            }
            Sets.Add((player, name, value));
            return SetResult;
        }

        public void Raise(IFakeEvents @event) => _handlers?.Invoke(this, @event);
    }

    private sealed class UnpatchedApi
    {
#pragma warning disable CS0067 // o evento existe, como no plugin original; só falta o SetPlayerPreference
        public event EventHandler<IFakeEvents>? DeathmatchEventHandlers;
#pragma warning restore CS0067
    }

#pragma warning disable CA1822 // a ponte exige membros de instância, como os do plugin
    private sealed class ThrowingEventApi
    {
        public bool SetPlayerPreference(object player, string name, object value) => true;

        public event EventHandler<IFakeEvents>? DeathmatchEventHandlers
        {
            add => throw new InvalidOperationException("assinatura recusada");
            remove { }
        }
    }

#pragma warning restore CA1822

    [Fact]
    public void A_ponte_so_existe_com_o_Deathmatch_patchado()
    {
        Assert.Null(DeathmatchBridge.TryCreate(null, _ => { }));
        Assert.Null(DeathmatchBridge.TryCreate(new object(), _ => { }));
        Assert.Null(DeathmatchBridge.TryCreate(new UnpatchedApi(), _ => { }));
        Assert.NotNull(DeathmatchBridge.TryCreate(new PatchedApi(), _ => { }));
    }

    [Fact]
    public void TrySet_grava_o_valor_booleano_pelo_membro_publico_e_devolve_o_que_o_plugin_respondeu()
    {
        var api = new PatchedApi();
        var bridge = DeathmatchBridge.TryCreate(api, _ => { })!;
        var player = new object();

        Assert.True(bridge.TrySet(player, "HitSound", false));
        api.SetResult = false; // o plugin ainda não tem os dados do jogador
        Assert.False(bridge.TrySet(player, "KillSound", true));

        Assert.Equal([(player, "HitSound", (object)false), (player, "KillSound", (object)true)], api.Sets);
    }

    [Fact]
    public void TrySet_que_lanca_devolve_false_e_relata_uma_vez_so()
    {
        var faults = new List<string>();
        var api = new PatchedApi { SetThrows = new InvalidCastException("tipo errado") };
        var bridge = DeathmatchBridge.TryCreate(api, faults.Add)!;

        Assert.False(bridge.TrySet(new object(), "HitSound", true));
        Assert.False(bridge.TrySet(new object(), "KillSound", true));

        var fault = Assert.Single(faults);
        Assert.Contains("HitSound", fault);
        Assert.Contains("tipo errado", fault);
    }

    [Fact]
    public void O_evento_do_jogador_chega_com_jogador_nome_e_valor_e_os_outros_eventos_sao_ignorados()
    {
        var api = new PatchedApi();
        var bridge = DeathmatchBridge.TryCreate(api, _ => { })!;
        var received = new List<(object Player, string Name, bool Value)>();
        var player = new object();

        Assert.True(bridge.Subscribe((p, n, v) => received.Add((p, n, v))));
        api.Raise(new OtherEvent());
        api.Raise(new OnPlayerPreferenceChanged(player, "HitSound", false));
        api.Raise(new OnPlayerPreferenceChanged(player, "OnlyHS", "texto")); // preferência de texto: o Carmine só guarda booleanas

        Assert.Equal([(player, "HitSound", false)], received);
    }

    [Fact]
    public void Unsubscribe_larga_o_evento()
    {
        var api = new PatchedApi();
        var bridge = DeathmatchBridge.TryCreate(api, _ => { })!;
        bridge.Subscribe((_, _, _) => { });
        Assert.Equal(1, api.Handlers);

        bridge.Unsubscribe();

        Assert.Equal(0, api.Handlers);
    }

    [Fact]
    public void Um_erro_no_tratamento_do_evento_nao_sobe_para_o_Deathmatch_e_e_relatado_uma_vez()
    {
        var faults = new List<string>();
        var api = new PatchedApi();
        var bridge = DeathmatchBridge.TryCreate(api, faults.Add)!;
        bridge.Subscribe((_, _, _) => throw new InvalidOperationException("falha do Core"));

        api.Raise(new OnPlayerPreferenceChanged(new object(), "HitSound", true));
        api.Raise(new OnPlayerPreferenceChanged(new object(), "HitSound", false));

        Assert.Single(faults);
    }

    [Fact]
    public void Subscribe_que_nao_consegue_assinar_devolve_false_relata_e_nao_lanca()
    {
        var faults = new List<string>();
        var bridge = DeathmatchBridge.TryCreate(new ThrowingEventApi(), faults.Add)!;

        Assert.False(bridge.Subscribe((_, _, _) => { }));

        Assert.Contains("assinatura recusada", Assert.Single(faults));
    }
}
