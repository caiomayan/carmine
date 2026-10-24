'use client';

import dynamic from 'next/dynamic';
import { type ReactNode, useState } from 'react';
import type { NumberKey, Period } from '@/lib/profile-series';
import { cn } from '@/lib/utils';
import { InView } from './in-view';
import type { ProfileChartsData } from './profile-charts';
import { Ticker } from './ticker';

// Os gráficos (visx, d3, bklit) só são baixados quando o bloco chega perto da tela.
const ProfileCharts = dynamic(() => import('./profile-charts'), { ssr: false });
const ProfileSpark = dynamic(() => import('./profile-spark'), { ssr: false });

export interface TileView {
  key: NumberKey;
  label: string;
  /** Nulo: sem dado (HS% sem nenhum abate). */
  value: number | null;
  decimals: number;
  suffix: string;
  trend: number[] | null;
}

export interface CardView {
  mode: string;
  title: string;
  rows: { key: string; label: string; text: string }[];
}

export interface StatsPanelProps {
  title: string;
  /** O que fica ao lado do título (ex.: "Só você vê"). */
  aside?: ReactNode;
  defaultPeriod: Period;
  /** Os períodos que existem; sem a série semanal só há o total e o seletor some. */
  periods: Period[];
  labels: {
    period: string;
    week: string;
    total: string;
    none: string;
    trend: string;
    groupLabel: string;
  };
  tiles: Record<Period, TileView[]>;
  cards: Record<Period, CardView[]>;
  charts: Omit<ProfileChartsData, 'period' | 'headshotPercent' | 'hours'> & {
    byPeriod: Record<Period, Pick<ProfileChartsData, 'headshotPercent' | 'hours'>>;
  };
}

/**
 * Estatísticas do Perfil (V3): o seletor Esta semana / Total, os quatro números grandes com a tendência das
 * últimas semanas, os cartões por Modo e, abaixo, os gráficos (sob demanda). Os dois períodos chegam prontos do
 * servidor; aqui só se escolhe qual mostrar. O HTML do servidor já traz o período padrão, então nada pisca.
 */
export function StatsPanel({
  title,
  aside,
  defaultPeriod,
  periods,
  labels,
  tiles,
  cards,
  charts,
}: StatsPanelProps) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const periodLabels: Record<Period, string> = { week: labels.week, total: labels.total };

  return (
    <div className="grid gap-4" data-testid="profile-stats" data-period={period}>
      <section
        aria-labelledby="estatisticas"
        className="v-panel v-panel-lg p-5 max-md:p-4"
        data-testid="stats-panel"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 pb-5">
          <h2
            id="estatisticas"
            className="inline-flex items-center gap-2.5 label-caps text-foreground"
          >
            <span aria-hidden="true" className="size-1.5 rotate-45 bg-foreground" />
            {title}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {aside}
            {periods.length > 1 ? (
              <fieldset className="m-0 flex min-w-0 rounded-full border-0 bg-(--fill-rest) p-0.5">
                <legend className="sr-only">{labels.period}</legend>
                {periods.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={period === id}
                    data-period-option={id}
                    onClick={() => setPeriod(id)}
                    className={cn(
                      'min-h-8 rounded-full px-3.5 text-caption font-semibold text-muted-foreground transition-colors duration-(--dur-fast) hover:text-foreground max-md:min-h-(--tap)',
                      period === id && 'bg-(--fill-active) text-foreground',
                    )}
                  >
                    {periodLabels[id]}
                  </button>
                ))}
              </fieldset>
            ) : null}
          </div>
        </header>

        <div className="grid gap-8">
          <dl
            className="grid grid-cols-4 gap-x-6 gap-y-6 max-md:grid-cols-2"
            data-testid="stats-highlights"
            data-period={period}
          >
            {tiles[period].map((tile) => (
              <div
                key={tile.key}
                data-stat={tile.key}
                data-highlight={tile.key}
                className="flex min-w-0 flex-col gap-1.5"
              >
                <dt className="order-2 text-body font-semibold text-muted-foreground">
                  {tile.label}
                </dt>
                <dd className="v-sign order-1 text-[clamp(44px,5vw,76px)] whitespace-nowrap">
                  {tile.value === null ? (
                    labels.none
                  ) : (
                    <Ticker
                      key={`${period}-${tile.key}`}
                      value={tile.value}
                      decimals={tile.decimals}
                      suffix={tile.suffix}
                    />
                  )}
                </dd>
                <dd className="order-3 min-h-8" aria-hidden="true">
                  {tile.trend ? (
                    <InView delayMs={1500} fallback={<div className="h-8" />}>
                      <ProfileSpark
                        values={tile.trend}
                        label={labels.trend.replace('{name}', tile.label)}
                      />
                    </InView>
                  ) : (
                    <div className="h-8" />
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-4 min-[760px]:grid-cols-2">
            {cards[period].map((card) => (
              <section
                key={card.mode}
                data-testid={`stats-${card.mode}`}
                aria-label={labels.groupLabel.replace('{mode}', card.title)}
                className="v-inner rounded-2xl bg-(--fill-rest) p-4"
              >
                <h3 className="pb-3 label-caps text-muted-foreground">{card.title}</h3>
                <dl className="grid gap-2">
                  {card.rows.map((row) => (
                    <div
                      key={row.key}
                      data-stat={row.key}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <dt className="text-body-sm text-muted-foreground">{row.label}</dt>
                      <dd className="text-md font-semibold tabular-nums">{row.text}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </section>

      <InView fallback={<ChartsSkeleton />}>
        <ProfileCharts
          data={{
            period,
            weeks: charts.weeks,
            labels: charts.labels,
            ...charts.byPeriod[period],
          }}
        />
      </InView>
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-4 min-[900px]:grid-cols-2">
      <div className="pf-skel h-[260px] rounded-2xl min-[900px]:col-span-2" />
      <div className="pf-skel h-[320px] rounded-2xl" />
      <div className="pf-skel h-[320px] rounded-2xl" />
    </div>
  );
}
