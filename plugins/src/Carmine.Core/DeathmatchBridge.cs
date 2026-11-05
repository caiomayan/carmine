using System.Reflection;

namespace Carmine.Core;

/// <summary>
/// A ponte com a API pública do Deathmatch patchado (<c>SetPlayerPreference</c> e o evento
/// <c>OnPlayerPreferenceChanged</c>, ADR 0028; patch em <c>infra/cs2/deathmatch-patch</c>). O Core fala com a
/// capability <c>deathmatch</c> por reflexão sobre os membros <b>públicos</b> da API, para não depender em tempo de
/// compilação de uma DLL que só existe depois do build do patch (a reflexão sobre campo privado continua descartada).
/// O jogador trafega como <see cref="object"/> (é um <c>CCSPlayerController</c> no jogo), o que deixa a ponte
/// testável sem o CounterStrikeSharp.
/// <para>
/// Falha com segurança: nada aqui lança para o Deathmatch nem para o Core. Um erro vira <c>false</c> (ou ignora o
/// evento) e é relatado <b>uma vez</b> por <c>onFault</c>. Só na thread do jogo.
/// </para>
/// </summary>
public sealed class DeathmatchBridge
{
    private readonly object _api;
    private readonly MethodInfo _set;
    private readonly EventInfo _event;
    private readonly Action<string> _onFault;
    private Delegate? _handler;
    private Action<object, string, bool>? _onChanged;
    private PropertyInfo? _playerProperty;
    private PropertyInfo? _nameProperty;
    private PropertyInfo? _valueProperty;
    private bool _faultReported;

    private DeathmatchBridge(object api, MethodInfo set, EventInfo @event, Action<string> onFault)
    {
        _api = api;
        _set = set;
        _event = @event;
        _onFault = onFault;
    }

    /// <summary>
    /// A ponte, ou <c>null</c> se a API não tem o <c>SetPlayerPreference(jogador, string, object)</c> e o evento do
    /// patch. <paramref name="onFault"/> recebe a descrição do primeiro erro que a ponte engolir.
    /// </summary>
    public static DeathmatchBridge? TryCreate(object? api, Action<string> onFault)
    {
        if (api is null)
        {
            return null;
        }
        try
        {
            var type = api.GetType();
            var set = type.GetMethods()
                .FirstOrDefault(m => m.Name == "SetPlayerPreference"
                    && m.GetParameters() is [_, { ParameterType: var name }, { ParameterType: var value }]
                    && name == typeof(string)
                    && value == typeof(object));
            var @event = type.GetEvent("DeathmatchEventHandlers");
            if (set is null || @event is null || @event.EventHandlerType is not { IsGenericType: true })
            {
                return null;
            }
            return new DeathmatchBridge(api, set, @event, onFault);
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            onFault($"a API do Deathmatch não pôde ser lida ({error.GetType().Name}: {error.Message})");
            return null;
        }
    }

    /// <summary>
    /// Grava o valor no plugin sem avisar o jogador nem disparar o evento (não volta como mudança do jogador).
    /// <c>false</c> se o plugin ainda não tem os dados do jogador ou se a chamada falhou (relatado uma vez).
    /// </summary>
    public bool TrySet(object player, string name, bool value)
    {
        try
        {
            return _set.Invoke(_api, [player, name, value]) is true;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            Fault($"SetPlayerPreference({name}) falhou ({Describe(error)})");
            return false;
        }
    }

    /// <summary>
    /// Passa a avisar quando o jogador muda uma preferência booleana pelo menu ou por um atalho. <c>false</c> se não
    /// deu para assinar o evento (relatado uma vez); quem chama deve largar a ponte.
    /// </summary>
    public bool Subscribe(Action<object, string, bool> onChanged)
    {
        if (_handler is not null)
        {
            return true;
        }
        try
        {
            var handlerType = _event.EventHandlerType!;
            var argument = handlerType.GetGenericArguments()[0];
            var method = typeof(DeathmatchBridge)
                .GetMethod(nameof(OnEvent), BindingFlags.NonPublic | BindingFlags.Instance)!
                .MakeGenericMethod(argument);
            var handler = Delegate.CreateDelegate(handlerType, this, method);
            _onChanged = onChanged;
            _event.AddEventHandler(_api, handler);
            _handler = handler;
            return true;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            _onChanged = null;
            Fault($"não deu para assinar o evento de preferência ({Describe(error)})");
            return false;
        }
    }

    public void Unsubscribe()
    {
        if (_handler is null)
        {
            return;
        }
        try
        {
            _event.RemoveEventHandler(_api, _handler);
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            Fault($"não deu para largar o evento de preferência ({Describe(error)})");
        }
        _handler = null;
        _onChanged = null;
    }

    /// <summary>
    /// Roda dentro do <c>TriggerEvent</c> do Deathmatch: nada pode escapar daqui, senão o erro sobe para o código do
    /// plugin que mudou a preferência do jogador.
    /// </summary>
    private void OnEvent<T>(object? sender, T @event)
        where T : class
    {
        try
        {
            var type = @event.GetType();
            if (type.Name != "OnPlayerPreferenceChanged")
            {
                return;
            }
            _playerProperty ??= type.GetProperty("player");
            _nameProperty ??= type.GetProperty("name");
            _valueProperty ??= type.GetProperty("value");
            if (_playerProperty?.GetValue(@event) is { } player
                && _nameProperty?.GetValue(@event) is string name
                && _valueProperty?.GetValue(@event) is bool value)
            {
                _onChanged?.Invoke(player, name, value);
            }
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            Fault($"o evento de preferência falhou ({Describe(error)})");
        }
    }

    private void Fault(string message)
    {
        if (_faultReported)
        {
            return;
        }
        _faultReported = true;
        try
        {
            _onFault(message);
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            // O relato é só diagnóstico: não pode ser ele a derrubar o Deathmatch.
            _ = error;
        }
    }

    private static string Describe(Exception error)
    {
        var inner = error is TargetInvocationException { InnerException: { } cause } ? cause : error;
        return $"{inner.GetType().Name}: {inner.Message}";
    }
}
