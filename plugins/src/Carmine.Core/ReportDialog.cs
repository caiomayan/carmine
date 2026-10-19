using System.Globalization;
using Carmine.Api.Client;

namespace Carmine.Core;

/// <summary>Um jogador que pode ser denunciado, como aparece na lista do <c>!report</c>.</summary>
public sealed record ReportCandidate(ulong SteamId, string Name);

/// <summary>O que o <c>!report</c> faz depois de uma resposta do jogador.</summary>
public abstract record ReportStep
{
    /// <summary>Mostrar estas linhas no chat do jogador (a lista de jogadores, a de motivos, um aviso).</summary>
    public sealed record Say(IReadOnlyList<string> Lines) : ReportStep;

    /// <summary>O jogador escolheu o alvo e o motivo: enviar a Denúncia à API.</summary>
    public sealed record Submit(ReportCandidate Target, ReportReason Reason) : ReportStep;
}

/// <summary>
/// O menu do <c>!report</c> (S13), em chat numerado: <c>!report</c> lista os jogadores,
/// <c>!report 3</c> escolhe o terceiro e lista os motivos, <c>!report 2</c> escolhe o motivo e
/// envia. O CS2MenuManager dos perfis é só uma biblioteca de apoio do RockTheVote e nenhum plugin
/// nosso depende dela, então o menu é o chat. Cada jogador tem o seu diálogo, que expira depois de
/// <see cref="Timeout"/> sem resposta. Quem pode ser denunciado (nunca o próprio jogador, nunca
/// bot) é decidido por quem chama; a API confere de novo. Seguro para uso por várias threads.
/// </summary>
public sealed class ReportDialog(TimeProvider time)
{
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(45);

    public const string NoPlayers = "Não há outros jogadores para denunciar.";
    public const string NothingOpen = "Nenhuma denúncia em andamento. Digite !report para começar.";
    public const string Expired = "A denúncia expirou. Digite !report para recomeçar.";

    /// <summary>Os motivos, na ordem do menu.</summary>
    public static readonly IReadOnlyList<(ReportReason Reason, string Label)> Reasons =
    [
        (ReportReason.Cheat, "Cheat"),
        (ReportReason.Voice, "Voz ofensiva"),
        (ReportReason.Offensive_chat, "Chat ofensivo"),
        (ReportReason.Griefing, "Antijogo"),
        (ReportReason.Other, "Outro"),
    ];

    private sealed record Pending(IReadOnlyList<ReportCandidate> Candidates, ReportCandidate? Target, DateTimeOffset ExpiresAt);

    private readonly Lock _lock = new();
    private readonly Dictionary<ulong, Pending> _pending = [];

    /// <summary><c>!report</c> sem número: abre (ou recomeça) o diálogo com a lista de jogadores.</summary>
    public ReportStep Start(ulong reporter, IReadOnlyList<ReportCandidate> candidates)
    {
        if (candidates.Count == 0)
        {
            Forget(reporter);
            return new ReportStep.Say([NoPlayers]);
        }
        lock (_lock)
        {
            _pending[reporter] = new Pending(candidates, null, time.GetUtcNow() + Timeout);
        }
        List<string> lines = ["Denunciar quem? Digite !report <número>:"];
        lines.AddRange(candidates.Select((c, i) => $"{(i + 1).ToString(CultureInfo.InvariantCulture)}. {c.Name}"));
        return new ReportStep.Say(lines);
    }

    /// <summary><c>!report &lt;número&gt;</c>: a escolha do jogador na etapa em que o diálogo está.</summary>
    public ReportStep Choose(ulong reporter, string argument)
    {
        lock (_lock)
        {
            if (!_pending.TryGetValue(reporter, out var pending))
            {
                return new ReportStep.Say([NothingOpen]);
            }
            if (time.GetUtcNow() >= pending.ExpiresAt)
            {
                _pending.Remove(reporter);
                return new ReportStep.Say([Expired]);
            }
            var count = pending.Target is null ? pending.Candidates.Count : Reasons.Count;
            if (!int.TryParse(argument.Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out var number)
                || number < 1 || number > count)
            {
                return new ReportStep.Say([$"Número inválido: escolha de 1 a {count.ToString(CultureInfo.InvariantCulture)}."]);
            }
            if (pending.Target is null)
            {
                var target = pending.Candidates[number - 1];
                _pending[reporter] = pending with { Target = target, ExpiresAt = time.GetUtcNow() + Timeout };
                List<string> lines = [$"Motivo da denúncia de {target.Name}? Digite !report <número>:"];
                lines.AddRange(Reasons.Select((r, i) => $"{(i + 1).ToString(CultureInfo.InvariantCulture)}. {r.Label}"));
                return new ReportStep.Say(lines);
            }
            _pending.Remove(reporter);
            return new ReportStep.Submit(pending.Target, Reasons[number - 1].Reason);
        }
    }

    /// <summary>O jogador saiu: o diálogo dele não vale mais.</summary>
    public void Forget(ulong reporter)
    {
        lock (_lock)
        {
            _pending.Remove(reporter);
        }
    }
}
