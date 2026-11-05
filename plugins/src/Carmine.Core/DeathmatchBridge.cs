using System.Reflection;
using CounterStrikeSharp.API.Core;

namespace Carmine.Core;

/// <summary>
/// A ponte com a API pública do Deathmatch patchado (<c>GetPlayerPreference</c>/<c>SetPlayerPreference</c> e o
/// evento <c>OnPlayerPreferenceChanged</c>, ADR 0028; patch em <c>infra/cs2/deathmatch-patch</c>). O Core fala com a
/// capability <c>deathmatch</c> por reflexão sobre os membros <b>públicos</b> da API, para não depender em tempo de
/// compilação de uma DLL que só existe depois do build do patch (a reflexão sobre campo privado continua descartada).
/// Se o plugin não é o patchado, <see cref="TryCreate"/> devolve <c>null</c> e o Deathmatch fica com as preferências
/// do plugin, como antes. Só na thread do jogo.
/// </summary>
public sealed class DeathmatchBridge
{
    private readonly object _api;
    private readonly MethodInfo _set;
    private readonly EventInfo _event;
    private Delegate? _handler;
    private Action<CCSPlayerController, string, bool>? _onChanged;
    private PropertyInfo? _playerProperty;
    private PropertyInfo? _nameProperty;
    private PropertyInfo? _valueProperty;

    private DeathmatchBridge(object api, MethodInfo set, EventInfo @event)
    {
        _api = api;
        _set = set;
        _event = @event;
    }

    /// <summary>A ponte, ou <c>null</c> se a API não tem o <c>SetPlayerPreference</c> e o evento do patch.</summary>
    public static DeathmatchBridge? TryCreate(object? api)
    {
        if (api is null)
        {
            return null;
        }
        var type = api.GetType();
        var set = type.GetMethod("SetPlayerPreference", [typeof(CCSPlayerController), typeof(string), typeof(object)]);
        var @event = type.GetEvent("DeathmatchEventHandlers");
        if (set is null || @event is null || @event.EventHandlerType is not { IsGenericType: true })
        {
            return null;
        }
        return new DeathmatchBridge(api, set, @event);
    }

    /// <summary>
    /// Grava o valor no plugin sem avisar o jogador nem disparar o evento (não volta como mudança do jogador).
    /// <c>false</c> se o plugin ainda não tem os dados do jogador.
    /// </summary>
    public bool TrySet(CCSPlayerController player, string name, bool value)
    {
        try
        {
            return _set.Invoke(_api, [player, name, value]) is true;
        }
        catch (TargetInvocationException)
        {
            return false;
        }
    }

    /// <summary>Passa a avisar quando o jogador muda uma preferência booleana pelo menu ou por um atalho.</summary>
    public void Subscribe(Action<CCSPlayerController, string, bool> onChanged)
    {
        if (_handler is not null)
        {
            return;
        }
        _onChanged = onChanged;
        var handlerType = _event.EventHandlerType!;
        var argument = handlerType.GetGenericArguments()[0];
        var method = typeof(DeathmatchBridge)
            .GetMethod(nameof(OnEvent), BindingFlags.NonPublic | BindingFlags.Instance)!
            .MakeGenericMethod(argument);
        _handler = Delegate.CreateDelegate(handlerType, this, method);
        _event.AddEventHandler(_api, _handler);
    }

    public void Unsubscribe()
    {
        if (_handler is null)
        {
            return;
        }
        _event.RemoveEventHandler(_api, _handler);
        _handler = null;
        _onChanged = null;
    }

    private void OnEvent<T>(object? sender, T @event)
        where T : class
    {
        var type = @event.GetType();
        if (type.Name != "OnPlayerPreferenceChanged")
        {
            return;
        }
        _playerProperty ??= type.GetProperty("player");
        _nameProperty ??= type.GetProperty("name");
        _valueProperty ??= type.GetProperty("value");
        if (_playerProperty?.GetValue(@event) is CCSPlayerController player
            && _nameProperty?.GetValue(@event) is string name
            && _valueProperty?.GetValue(@event) is bool value)
        {
            _onChanged?.Invoke(player, name, value);
        }
    }
}
