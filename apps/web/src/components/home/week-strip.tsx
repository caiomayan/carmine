'use client';

import type { WeekSummary } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useState } from 'react';
import { Ticker } from '@/components/vida/ticker';
import {
  type WeekDelta,
  type WeekRow,
  weekProgress,
  weekRange,
  weekRows,
  weekTurnAt,
} from '@/lib/home/week-stats';
import { cn } from '@/lib/utils';

/** Um dígito que rola: a técnica do countdown do daisyUI (a variável `--d` e uma coluna de 0 a 9 que desliza). */
function Digit({ value }: { value: number }) {
  return <span aria-hidden="true" className="vh-digit" style={{ '--d': value } as CSSProperties} />;
}

function Unit({ value, label, pad = 2 }: { value: number; label: string; pad?: number }) {
  const text = String(value).padStart(pad, '0');
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="inline-flex">
        {text
          .split('')
          .map((ch, i) => ({ place: text.length - i, digit: Number(ch) }))
          .map(({ place, digit }) => (
            // A casa (unidade, dezena...) é a chave: o dígito dela muda de valor e a coluna desliza.
            <Digit key={place} value={digit} />
          ))}
      </span>
      <span className="text-[0.4em] font-semibold tracking-normal text-muted-foreground normal-case">
        {label}
      </span>
    </span>
  );
}

/**
 * Contagem regressiva até a virada da semana do Ranking, com os dígitos rolando a cada segundo. Fica no estado
 * inicial (zeros) até a hidratação, para o servidor e o navegador não discordarem do relógio.
 */
function WeekCountdown({ turnAt, className }: { turnAt: number; className?: string }) {
  const t = useTranslations('home.week.countdown');
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, turnAt - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [turnAt]);
  const total = Math.floor((left ?? 0) / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return (
    <span
      role="timer"
      aria-label={left === null ? t('waiting') : t('left', { days, hours, minutes, seconds })}
      data-testid="week-countdown"
      className={cn(
        'v-sign inline-flex flex-wrap items-baseline gap-x-3 text-[1.6em] leading-none',
        className,
      )}
    >
      <Unit value={days} label={t('d')} pad={1} />
      <Unit value={hours} label={t('h')} />
      <Unit value={minutes} label={t('min')} />
      <Unit value={seconds} label={t('s')} />
    </span>
  );
}

function DeltaText({ delta }: { delta: WeekDelta | null }) {
  const t = useTranslations('home.week.delta');
  if (!delta) return null;
  if (delta.direction === 'same') return <>{t('same')}</>;
  return <>{t(`${delta.kind}.${delta.direction}`, { amount: delta.amount })}</>;
}

/**
 * Faixa de números da semana, de borda a borda: jogadores, abates, HS% e horas de todas as Contas (`GET
 * /api/stats/week`), com a contagem que sobe quando a faixa entra na tela e a variação sobre a semana passada, só
 * quando há uma semana passada para comparar. "Partida" não aparece de propósito: só existe no 5v5 (CONTEXT.md). Sem
 * jogo na semana, a faixa diz isso; com a API fora, ela não aparece.
 */
export function WeekStrip({ summary }: { summary: WeekSummary | null }) {
  const t = useTranslations('home.week');
  // Relógio só no navegador: o servidor e a hidratação concordam em "sem barra" até aqui.
  const [progress, setProgress] = useState<{ ratio: number; day: string } | null>(null);
  const weekStart = summary?.weekStart;
  useEffect(() => {
    if (!weekStart) return;
    const update = () => {
      const now = Date.now();
      setProgress({
        ratio: weekProgress(weekStart, now),
        day: new Intl.DateTimeFormat('pt-BR', {
          weekday: 'long',
          timeZone: 'America/Sao_Paulo',
        }).format(now),
      });
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [weekStart]);

  if (!summary) return null;
  const rows = summary.current.players > 0 ? weekRows(summary) : null;

  return (
    <section
      aria-labelledby="home-week"
      data-testid="week-strip"
      style={{ '--vh-band': 'var(--surface)' } as CSSProperties}
      className="vh-band mt-16 py-12 max-md:py-9"
    >
      <div className="grid items-end gap-x-10 gap-y-9 min-[1100px]:grid-cols-[minmax(230px,0.85fr)_repeat(4,minmax(0,1fr))] max-[1099px]:grid-cols-2">
        <div className="grid gap-3 max-[1099px]:col-span-full">
          <h2 id="home-week" className="v-title whitespace-nowrap">
            {t('title')}
          </h2>
          <p className="text-body-sm text-muted-foreground">
            {weekRange(summary.weekStart, summary.weekEnd)}
          </p>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption text-muted-foreground">
            {t('turns')}{' '}
            <WeekCountdown
              turnAt={weekTurnAt(summary.weekStart)}
              className="text-[28px] text-foreground"
            />
          </p>
          <div
            className="vh-bar max-w-[260px]"
            role="img"
            aria-label={
              progress
                ? t('progress', { day: progress.day, percent: Math.round(progress.ratio * 100) })
                : t('progressWaiting')
            }
          >
            <span style={{ transform: `scaleX(${progress?.ratio ?? 0})` }} />
          </div>
        </div>
        {rows ? (
          <dl className="contents">
            {rows.map((row) => (
              <WeekStat key={row.key} row={row} />
            ))}
          </dl>
        ) : (
          <p
            className="text-body text-muted-foreground min-[1100px]:col-span-4"
            data-testid="week-empty"
          >
            {t('empty')}
          </p>
        )}
      </div>
    </section>
  );
}

function WeekStat({ row }: { row: WeekRow }) {
  const t = useTranslations('home.week.rows');
  return (
    <div data-stat={row.key} className="flex flex-col gap-1.5">
      <dt className="order-2 text-body font-semibold text-foreground">{t(row.key)}</dt>
      <dd className="v-sign order-1 text-[clamp(50px,5vw,80px)] whitespace-nowrap">
        <Ticker value={row.value} decimals={row.decimals} suffix={row.suffix} />
      </dd>
      <dd className="order-3 text-caption text-muted-foreground">
        <DeltaText delta={row.delta} />
      </dd>
    </div>
  );
}
