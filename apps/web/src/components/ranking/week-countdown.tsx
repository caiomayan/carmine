'use client';

import { useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useState } from 'react';
import { nextWeekTurn } from '@/lib/ranking';
import { cn } from '@/lib/utils';
import './week-countdown.css';

/**
 * Um dígito que rola: uma coluna de 0 a 9 (o `::before` do `.rk-digit`, ver week-countdown.css) que
 * desliza até o valor em `--d`. O texto de verdade fica no `aria-label` do conjunto.
 */
function Digit({ value }: { value: number }) {
  return <span aria-hidden="true" className="rk-digit" style={{ '--d': value } as CSSProperties} />;
}

function Unit({ value, label, pad = 2 }: { value: number; label: string; pad?: number }) {
  const text = String(value).padStart(pad, '0');
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="inline-flex">
        {text.split('').map((char, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a casa do dígito é a identidade: o valor muda e a coluna desliza, em vez de remontar.
          <Digit key={text.length - index} value={Number(char)} />
        ))}
      </span>
      <span aria-hidden="true" className="text-[0.4em] font-semibold text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

/**
 * Contagem regressiva até a virada da semana do Ranking (segunda-feira, 00:00 de Brasília), com os
 * dígitos rolando a cada segundo. Antes da hidratação fica em zeros, para o servidor e o navegador
 * não discordarem do relógio; o leitor de tela ouve a frase, não os rolos.
 */
export function WeekCountdown({ className }: { className?: string }) {
  const t = useTranslations('ranking.countdown');
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, nextWeekTurn(Date.now()) - Date.now()));
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
      // Sem `aria-live`: um timer não anuncia a cada segundo; quem navega até ele ouve o valor.
      role="timer"
      aria-label={left === null ? t('pending') : t('aria', { days, hours, minutes, seconds })}
      data-testid="week-countdown"
      className={cn(
        'v-sign inline-flex flex-wrap items-baseline gap-x-3 text-[26px] leading-none',
        className,
      )}
    >
      <Unit value={days} label={t('days')} pad={1} />
      <Unit value={hours} label={t('hours')} />
      <Unit value={minutes} label={t('minutes')} />
      <Unit value={seconds} label={t('seconds')} />
    </span>
  );
}
