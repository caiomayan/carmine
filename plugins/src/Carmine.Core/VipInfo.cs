using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>
/// O VIP no chat do jogo (S14): o aviso do fim do VIP que a API manda no connect (3 dias antes, no dia e
/// no dia em que acabou) e o <c>!vip</c>. O aviso espera o primeiro spawn (no connect o jogador está na
/// escolha de time e não vê o chat) e vale uma vez por conexão. A conta dos dias é no horário de Brasília,
/// o mesmo do site (UTC-3 o ano todo desde 2019). Seguro para uso por várias threads.
/// </summary>
public sealed class VipInfo(ICarmineApiClient api, TimeProvider time)
{
    public const string BuyUrl = "stcarmine.com/vip";
    public const string NoStatusMessage = "Não deu para consultar seu VIP agora. Veja em " + BuyUrl;

    private static readonly TimeSpan Brasilia = TimeSpan.FromHours(-3);
    private readonly Lock _lock = new();
    private readonly Dictionary<ulong, string> _pending = [];

    /// <summary>A API respondeu ao connect: guarda o aviso (se houver) para o primeiro spawn.</summary>
    public void OnConnectResult(ulong steamId, VipNotice? notice, DateTimeOffset? endsAt)
    {
        var message = NoticeMessage(notice, endsAt, time.GetUtcNow());
        lock (_lock)
        {
            if (message is null)
            {
                _pending.Remove(steamId);
            }
            else
            {
                _pending[steamId] = message;
            }
        }
    }

    /// <summary>O aviso pendente, uma única vez; <c>null</c> se não há.</summary>
    public string? TakeOnSpawn(ulong steamId)
    {
        lock (_lock)
        {
            return _pending.Remove(steamId, out var message) ? message : null;
        }
    }

    public void OnDisconnect(ulong steamId)
    {
        lock (_lock)
        {
            _pending.Remove(steamId);
        }
    }

    /// <summary>O texto do aviso do fim do VIP; <c>null</c> sem aviso.</summary>
    public static string? NoticeMessage(VipNotice? notice, DateTimeOffset? endsAt, DateTimeOffset now) => notice switch
    {
        VipNotice.Ending_soon when endsAt is { } ends => DaysLeftMessage(ends, now),
        VipNotice.Ending_soon => $"Seu VIP está perto do fim. Para renovar: {BuyUrl}",
        VipNotice.Ending_today => $"Seu VIP acaba hoje. Para renovar: {BuyUrl}",
        VipNotice.Ended_today => $"Seu VIP acabou hoje. Para voltar a ter VIP: {BuyUrl}",
        _ => null,
    };

    /// <summary>A resposta ao <c>!vip</c>, a partir do que a API diz agora.</summary>
    public static string StatusMessage(PlayerVip vip, DateTimeOffset now)
    {
        if (vip.Active && vip.EndsAt is { } ends)
        {
            var until = ends.ToOffset(Brasilia).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            return $"Seu VIP vai até {until}. Para somar mais dias: {BuyUrl}";
        }
        return $"Você não tem VIP agora. Veja como ter: {BuyUrl}";
    }

    /// <summary>Consulta a API e monta a resposta; nunca lança por falha da API. Roda fora da thread do jogo.</summary>
    public async Task<string> StatusAsync(ulong steamId, CancellationToken cancellationToken)
    {
        try
        {
            var vip = await api.GetPlayerVipAsync(steamId.ToString(CultureInfo.InvariantCulture), cancellationToken)
                .ConfigureAwait(false);
            return StatusMessage(vip, time.GetUtcNow());
        }
        catch (Exception error) when (error is ApiException or HttpRequestException
            || (error is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            return NoStatusMessage;
        }
    }

    private static string DaysLeftMessage(DateTimeOffset ends, DateTimeOffset now)
    {
        var days = ends.ToOffset(Brasilia).Date.Subtract(now.ToOffset(Brasilia).Date).Days;
        var date = ends.ToOffset(Brasilia).ToString("dd/MM", CultureInfo.InvariantCulture);
        var when = days switch
        {
            <= 1 => "amanhã",
            _ => $"em {days} dias",
        };
        return $"Seu VIP acaba {when} ({date}). Para renovar: {BuyUrl}";
    }
}
