import { type Deadline, deadlineAtOf } from '@/lib/time';

/** O prazo de um caso: o que falta e a barra que esvazia. Sem `deadlineAt` não há prazo correndo e nada fica vermelho. */
export function Eta({
  deadlineAt,
  hours,
  nowMs,
}: {
  deadlineAt: string | null;
  hours: number;
  nowMs: number;
}) {
  const deadline: Deadline | null = deadlineAtOf(deadlineAt, hours, nowMs);
  if (!deadline) {
    return (
      <span className="stp-eta" data-tone="none" title="Sem prazo correndo">
        sem prazo
      </span>
    );
  }
  return (
    <span className="stp-eta" data-tone={deadline.tone}>
      {deadline.label}
      <span className="stp-bar" aria-hidden="true">
        <i style={{ width: `${Math.max(3, Math.round(deadline.remaining * 100))}%` }} />
      </span>
    </span>
  );
}

/** O estado do caso em ponto colorido (nunca bloco): a cor é só de contexto. */
export function StatusDot({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'danger' | 'none';
  children: string;
}) {
  return (
    <span className="stp-dot" data-tone={tone === 'none' ? undefined : tone}>
      {children}
    </span>
  );
}

const STAMP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** "28/10 19:19" no horário de Brasília (o mesmo no servidor e no navegador). */
export const stamp = (iso: string) => STAMP.format(new Date(iso)).replace(',', '');
