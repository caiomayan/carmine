'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** Próxima virada da semana do Ranking: segunda-feira, 00:00 no horário de Brasília (UTC−3, sem horário de verão). */
export function nextWeekTurn(now = Date.now()): number {
  const BRT = 3 * 3600_000;
  const local = new Date(now - BRT);
  const day = local.getUTCDay(); // 0 = domingo, 1 = segunda
  const ahead = day === 1 && local.getUTCHours() === 0 && local.getUTCMinutes() === 0 ? 7 : (8 - day) % 7 || 7;
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + ahead, 0, 0, 0) + BRT;
}

/**
 * Um dígito que rola: a técnica do countdown do daisyUI (a variável `--d` e uma coluna de 0 a 9 que desliza),
 * reimplementada sem o plugin. A coluna é o `::before` do `.v-digit` (ver vida.css); o texto de verdade fica
 * no `aria-label` do conjunto.
 */
function Digit({ value }: { value: number }) {
  return <span aria-hidden="true" className="v-digit" style={{ '--d': value } as React.CSSProperties} />;
}

function Unit({ value, label, pad = 2 }: { value: number; label: string; pad?: number }) {
  const text = String(value).padStart(pad, '0');
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="inline-flex">
        {text.split('').map((ch, i) => (
          // A posição é a chave: o dígito da casa muda de valor e a coluna desliza.
          <Digit key={`${text.length - i}`} value={Number(ch)} />
        ))}
      </span>
      <span className="text-[0.4em] font-semibold tracking-normal text-muted-foreground normal-case">{label}</span>
    </span>
  );
}

/**
 * Contagem regressiva até a virada da semana do Ranking, com os dígitos rolando a cada segundo. Fica no
 * estado inicial (zeros) até a hidratação, para o servidor e o navegador não discordarem do relógio.
 */
export function WeekCountdown({ className }: { className?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, nextWeekTurn() - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const total = Math.floor((left ?? 0) / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return (
    <span
      role="timer"
      aria-label={left === null ? 'Contando até a virada da semana' : `Faltam ${days} dias, ${hours} horas, ${minutes} minutos e ${seconds} segundos para a virada da semana`}
      data-testid="vida-countdown"
      className={cn('v-sign inline-flex flex-wrap items-baseline gap-x-3 text-[1.6em] leading-none', className)}
    >
      <Unit value={days} label="d" pad={1} />
      <Unit value={hours} label="h" />
      <Unit value={minutes} label="min" />
      <Unit value={seconds} label="s" />
    </span>
  );
}
