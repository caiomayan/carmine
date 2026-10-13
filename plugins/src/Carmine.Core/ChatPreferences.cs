using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>O que o jogador pediu com o <c>!chat</c>.</summary>
public enum ChatToggle
{
    /// <summary><c>!chat off</c>: não receber o chat dos outros jogadores.</summary>
    Hide,

    /// <summary><c>!chat on</c>: receber de novo (o padrão).</summary>
    Show,
}

/// <summary>A resposta ao <c>!chat</c>: o texto para o jogador e se a API guardou a escolha.</summary>
public sealed record ChatToggleResult(string Message, bool Saved);

/// <summary>
/// O <c>!chat off</c> / <c>!chat on</c>: o jogador oculta para si as mensagens de chat dos outros
/// jogadores (as próprias, as da Staff e os avisos do servidor continuam chegando). Padrão: chat
/// visível. A escolha vale na hora e é guardada por Conta na API, que a devolve em cada connect
/// (<see cref="PlayerConnectResult.ChatHidden"/>); com a API fora, vale até o jogador sair.
/// Seguro para uso por várias threads.
/// </summary>
public sealed class ChatPreferences(ICarmineApiClient api)
{
    public const string HiddenMessage = "Chat dos outros jogadores oculto para você. Para ver de novo: !chat on";
    public const string VisibleMessage = "Chat dos outros jogadores visível de novo.";
    public const string UsageMessage = "Use !chat off para ocultar o chat dos outros jogadores, ou !chat on para ver de novo.";
    public const string ReminderMessage = "Seu chat está oculto (!chat off). Para ver o chat dos outros: !chat on";
    public const string NotSavedNotice = "(Não deu para salvar agora: vale até você sair do servidor.)";

    private readonly Lock _lock = new();
    private readonly HashSet<ulong> _hidden = [];
    private readonly HashSet<ulong> _reminders = [];

    /// <summary>O argumento do <c>!chat</c>, ou <c>null</c> se não é <c>on</c> nem <c>off</c>.</summary>
    public static ChatToggle? Parse(string argument) => argument.Trim().ToLowerInvariant() switch
    {
        "off" => ChatToggle.Hide,
        "on" => ChatToggle.Show,
        _ => null,
    };

    public bool IsHidden(ulong steamId)
    {
        lock (_lock)
        {
            return _hidden.Contains(steamId);
        }
    }

    /// <summary>
    /// Dos <paramref name="recipients"/> de uma mensagem de chat de <paramref name="sender"/>, os que
    /// não devem recebê-la. Mensagem sem autor (0, do servidor) chega a todos.
    /// </summary>
    public IReadOnlyList<ulong> HiddenFrom(ulong sender, IEnumerable<ulong> recipients)
    {
        if (sender == 0)
        {
            return [];
        }
        lock (_lock)
        {
            return [.. recipients.Where(r => r != sender && _hidden.Contains(r))];
        }
    }

    /// <summary>A API respondeu ao connect: vale a escolha guardada (e o lembrete no spawn).</summary>
    public void OnConnectResult(ulong steamId, bool chatHidden)
    {
        lock (_lock)
        {
            Set(steamId, chatHidden);
            if (chatHidden)
            {
                _reminders.Add(steamId);
            }
            else
            {
                _reminders.Remove(steamId);
            }
        }
    }

    /// <summary><c>true</c> uma vez por connect, para quem entrou com o chat oculto.</summary>
    public bool TakeReminderOnSpawn(ulong steamId)
    {
        lock (_lock)
        {
            return _reminders.Remove(steamId);
        }
    }

    public void OnDisconnect(ulong steamId)
    {
        lock (_lock)
        {
            _hidden.Remove(steamId);
            _reminders.Remove(steamId);
        }
    }

    /// <summary>
    /// Aplica na hora e guarda na API. Nunca lança por falha da API: a escolha vale até o jogador
    /// sair e a resposta avisa. Roda fora da thread do jogo.
    /// </summary>
    public async Task<ChatToggleResult> SetAsync(ulong steamId, ChatToggle toggle, CancellationToken cancellationToken)
    {
        var hidden = toggle == ChatToggle.Hide;
        lock (_lock)
        {
            Set(steamId, hidden);
            _reminders.Remove(steamId);
        }
        var message = hidden ? HiddenMessage : VisibleMessage;
        try
        {
            await api.SetPlayerChatPreferenceAsync(
                steamId.ToString(CultureInfo.InvariantCulture),
                new PlayerChatPreference { Hidden = hidden },
                cancellationToken).ConfigureAwait(false);
            return new ChatToggleResult(message, Saved: true);
        }
        catch (Exception error) when (error is ApiException or HttpRequestException
            || (error is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            return new ChatToggleResult($"{message} {NotSavedNotice}", Saved: false);
        }
    }

    private void Set(ulong steamId, bool hidden)
    {
        if (hidden)
        {
            _hidden.Add(steamId);
        }
        else
        {
            _hidden.Remove(steamId);
        }
    }
}
