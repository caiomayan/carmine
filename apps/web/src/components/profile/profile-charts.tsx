'use client';

import { domMax, LazyMotion } from 'framer-motion';
import { type CSSProperties, useMemo } from 'react';
import { Area, AreaChart } from '@/components/bklit/charts/area-chart';
import { Gauge } from '@/components/bklit/charts/gauge';
import { Grid } from '@/components/bklit/charts/grid';
import { Ring } from '@/components/bklit/charts/ring';
import { RingCenter } from '@/components/bklit/charts/ring-center';
import { RingChart } from '@/components/bklit/charts/ring-chart';
import { ChartTooltip } from '@/components/bklit/charts/tooltip';
import { XAxis } from '@/components/bklit/charts/x-axis';
import type { Period } from '@/lib/profile-series';

export interface ProfileChartsData {
  period: Period;
  /** Rounds jogados em cada uma das semanas da série (a última é a atual). */
  weeks: { weekStart: string; rounds: number }[];
  /** HS% do período; nulo sem nenhum abate. */
  headshotPercent: number | null;
  /** Segundos por Modo no período, com o nome do Modo já traduzido e a cor do Modo. */
  hours: { mode: string; label: string; seconds: number; color: string }[];
  labels: {
    rounds: { title: string; note: string };
    head: { title: string; weekNote: string; totalNote: string; label: string; none: string };
    hours: { title: string; weekNote: string; totalNote: string; total: string; none: string };
  };
}

/** Horas com uma casa, no formato do site. */
const hoursText = (seconds: number) =>
  `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(seconds / 3600)} h`;

/**
 * Gráficos do Perfil (V3), do bklit-ui (MIT; copiado em components/bklit, ver LICENSE-bklit.md): rounds por
 * semana (área), HS% (gauge) e horas por Modo (anel), todos com os dados reais da série semanal. Carregado sob
 * demanda, só quando o bloco chega perto da tela, e com o próprio LazyMotion: os gráficos usam o `motion`
 * completo e o do site é `strict`.
 */
export default function ProfileCharts({ data }: { data: ProfileChartsData }) {
  const { period, labels } = data;
  const series = useMemo(
    () =>
      data.weeks.map((week) => ({
        date: new Date(`${week.weekStart}T12:00:00Z`),
        rounds: week.rounds,
      })),
    [data.weeks],
  );
  const totalSeconds = data.hours.reduce((sum, entry) => sum + entry.seconds, 0);
  const rings = data.hours.map((entry) => ({
    label: entry.label,
    value: Number((entry.seconds / 3600).toFixed(2)),
    maxValue: Number((totalSeconds / 3600).toFixed(2)),
    color: entry.color,
  }));

  return (
    <LazyMotion features={domMax}>
      <div className="pf-charts grid gap-4 min-[900px]:grid-cols-2" data-testid="profile-charts">
        <section className="v-panel v-panel-lg p-5 max-md:p-4 min-[900px]:col-span-2">
          <header className="grid gap-1 pb-3">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{labels.rounds.title}</h3>
            <p className="text-caption text-muted-foreground">{labels.rounds.note}</p>
          </header>
          <AreaChart
            data={series}
            xDataKey="date"
            aspectRatio="16 / 5"
            margin={{ top: 16, right: 28, bottom: 28, left: 28 }}
          >
            <Grid horizontal />
            <Area dataKey="rounds" fill="var(--chart-line-primary)" fillOpacity={0.3} />
            <XAxis />
            <ChartTooltip />
          </AreaChart>
        </section>

        <section
          className="v-panel v-panel-lg p-5 max-md:p-4"
          data-testid="chart-headshot"
          // O gauge pinta do verde ao âmbar pela paleta do tema (--chart-1 a --chart-5).
          style={
            {
              '--chart-1': 'var(--status-online)',
              '--chart-5': 'var(--status-warn)',
            } as CSSProperties
          }
        >
          <header className="grid gap-1 pb-3">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{labels.head.title}</h3>
            <p className="text-caption text-muted-foreground">
              {period === 'week' ? labels.head.weekNote : labels.head.totalNote}
            </p>
          </header>
          {data.headshotPercent === null ? (
            <p className="py-10 text-center text-body-sm text-muted-foreground">
              {labels.head.none}
            </p>
          ) : (
            <div className="mx-auto max-w-[360px]">
              <Gauge
                value={data.headshotPercent}
                centerValue={data.headshotPercent}
                defaultLabel={labels.head.label}
                suffix="%"
                totalNotches={36}
                spacing={30}
                notchCornerRadius={3}
                useGradient
                formatOptions={{ maximumFractionDigits: 1 }}
              />
            </div>
          )}
        </section>

        <section className="v-panel v-panel-lg p-5 max-md:p-4" data-testid="chart-hours">
          <header className="grid gap-1 pb-3">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{labels.hours.title}</h3>
            <p className="text-caption text-muted-foreground">
              {(period === 'week' ? labels.hours.weekNote : labels.hours.totalNote).replace(
                '{hours}',
                hoursText(totalSeconds),
              )}
            </p>
          </header>
          {rings.length === 0 ? (
            <p className="py-10 text-center text-body-sm text-muted-foreground">
              {labels.hours.none}
            </p>
          ) : (
            <>
              <div className="mx-auto max-w-[300px]">
                <RingChart
                  data={rings}
                  size={260}
                  strokeWidth={14}
                  ringGap={8}
                  baseInnerRadius={64}
                >
                  {rings.map((ring, index) => (
                    <Ring key={ring.label} index={index} />
                  ))}
                  <RingCenter
                    defaultLabel={labels.hours.total}
                    suffix=" h"
                    formatOptions={{ maximumFractionDigits: 1 }}
                  />
                </RingChart>
              </div>
              <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-2 text-caption font-semibold">
                {data.hours.map((entry) => (
                  <li key={entry.mode} className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ background: entry.color }}
                    />
                    {entry.label}
                    <span className="font-normal text-muted-foreground tabular-nums">
                      {hoursText(entry.seconds)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </LazyMotion>
  );
}
