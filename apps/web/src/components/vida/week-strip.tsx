'use client';

import type { CSSProperties } from 'react';
import { WEEK } from './data';
import { WeekCountdown } from './countdown';
import { Ticker } from './ticker';

/**
 * Faixa de números da semana, de borda a borda: rounds, abates, HS% e horas, com contagem que sobe
 * quando a faixa entra na tela. "Partida" não aparece de propósito: só existe no 5v5 (CONTEXT.md).
 */
export function WeekStrip() {
  return (
    <section
      aria-labelledby="vida-semana"
      data-testid="vida-week"
      style={{ '--v-band': 'var(--surface)' } as CSSProperties}
      className="v-band mt-16 py-12 max-md:py-9"
    >
      <div className="grid items-end gap-x-10 gap-y-9 min-[1100px]:grid-cols-[minmax(230px,0.85fr)_repeat(4,minmax(0,1fr))] max-[1099px]:grid-cols-2">
        <div className="grid gap-3 max-[1099px]:col-span-full">
          <h2 id="vida-semana" className="v-title whitespace-nowrap">
            Esta semana
          </h2>
          <p className="text-body-sm text-muted-foreground">{WEEK.range}</p>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption text-muted-foreground">
            Ranking vira em <WeekCountdown className="text-[28px] text-foreground" />
          </p>
          <div className="v-bar max-w-[260px]" role="img" aria-label="Quinta-feira: a semana passou de 60%">
            <span style={{ transform: `scaleX(${WEEK.progress})` }} />
          </div>
        </div>
        <dl className="contents">
          {WEEK.rows.map((row) => (
            <div
              key={row.key}
              data-stat={row.key}
              className="flex flex-col gap-1.5"
            >
              <dd
                className="v-sign order-1 text-[clamp(50px,5vw,80px)] whitespace-nowrap"
              >
                <Ticker value={row.value} decimals={row.decimals} suffix={row.suffix} />
              </dd>
              <dt className="order-2 text-body font-semibold text-foreground">{row.label}</dt>
              <dd className="order-3 text-caption text-muted-foreground">{row.delta}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
