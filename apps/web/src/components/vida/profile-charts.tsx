'use client';

import { domMax, LazyMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Area, AreaChart } from '@/components/bklit/charts/area-chart';
import { Gauge } from '@/components/bklit/charts/gauge';
import { Grid } from '@/components/bklit/charts/grid';
import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
} from '@/components/bklit/charts/heatmap';
import { RadarArea } from '@/components/bklit/charts/radar-area';
import { RadarAxis } from '@/components/bklit/charts/radar-axis';
import { RadarChart } from '@/components/bklit/charts/radar-chart';
import { RadarGrid } from '@/components/bklit/charts/radar-grid';
import { RadarLabels } from '@/components/bklit/charts/radar-labels';
import { Ring } from '@/components/bklit/charts/ring';
import { RingCenter } from '@/components/bklit/charts/ring-center';
import { RingChart } from '@/components/bklit/charts/ring-chart';
import { ChartTooltip } from '@/components/bklit/charts/tooltip';
import { XAxis } from '@/components/bklit/charts/x-axis';

/**
 * Gráficos do Perfil (proto/vida), do bklit-ui (MIT; copiado em components/bklit, ver LICENSE-bklit.md):
 * mapa de calor de atividade, área de rounds por semana, radar de armas por lado, gauge de HS% e anel de
 * horas por Modo. Os dados são de exemplo. Carregado sob demanda (só quando o bloco chega perto da tela),
 * e com o próprio LazyMotion, porque os gráficos usam `motion` completo e o do site é `strict`.
 */

/** Atividade das últimas 20 semanas (colunas) por dia (linhas), 0 a 4, com um padrão estável. */
function activityData() {
  const columns = [];
  const start = new Date(2026, 5, 8); // segunda-feira
  for (let w = 0; w < 20; w++) {
    const bins = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const seed = Math.sin((w + 1) * 12.9898 + (d + 1) * 78.233) * 43758.5453;
      const r = seed - Math.floor(seed);
      const weekend = d >= 5 ? 0.18 : 0;
      const level = r + weekend > 0.92 ? 4 : r + weekend > 0.74 ? 3 : r + weekend > 0.5 ? 2 : r > 0.28 ? 1 : 0;
      bins.push({ bin: d, count: level, date });
    }
    columns.push({ bin: w, bins });
  }
  return columns;
}

const WEEKLY = [210, 340, 295, 420, 380, 150, 460, 388].map((rounds, i) => ({
  date: new Date(2026, 8, 7 + i * 7),
  rounds,
}));

const WEAPONS = [
  { key: 'ak', label: 'AK-47' },
  { key: 'm4', label: 'M4A1-S' },
  { key: 'awp', label: 'AWP' },
  { key: 'deagle', label: 'Desert Eagle' },
  { key: 'usp', label: 'USP-S' },
  { key: 'knife', label: 'Faca' },
];
const SIDES = [
  { label: 'CT', color: 'var(--side-ct)', values: { ak: 12, m4: 88, awp: 64, deagle: 46, usp: 72, knife: 22 } },
  { label: 'TR', color: 'var(--side-t)', values: { ak: 92, m4: 10, awp: 48, deagle: 58, usp: 14, knife: 30 } },
];

const MODES = [
  { label: 'Retake', value: 9.2, maxValue: 14.5, color: 'var(--side-ct)' },
  { label: 'Deathmatch', value: 5.3, maxValue: 14.5, color: 'var(--side-t)' },
];

function Card({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`v-panel v-spot p-5 max-md:p-4 ${className ?? ''}`}>
      <header className="grid gap-1 pb-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        {note ? <p className="text-caption text-muted-foreground">{note}</p> : null}
      </header>
      {children}
    </section>
  );
}

export default function ProfileCharts() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [heat] = useState(activityData);

  return (
    <div ref={ref} className="v-charts grid gap-4" data-testid="vida-charts">
      {visible ? (
        <LazyMotion features={domMax}>
          <Card title="Atividade" note="Rounds por dia nas últimas 20 semanas" className="v-panel-lg">
            <HeatmapInteractionProvider>
              <HeatmapInteractionBoundary>
                <HeatmapChart data={heat} layout="fluid" weekStartDay={1} aspectRatio="4 / 1">
                  <HeatmapCells />
                  <HeatmapXAxis />
                  <HeatmapYAxis />
                  <HeatmapTooltip formatLabel={(count, date) => `${['nenhum', 'poucos', 'alguns', 'muitos', 'muitíssimos'][count] ?? ''} rounds · ${date.toLocaleDateString('pt-BR')}`} />
                </HeatmapChart>
                <HeatmapLegend lessLabel="Menos" moreLabel="Mais" />
              </HeatmapInteractionBoundary>
            </HeatmapInteractionProvider>
          </Card>

          <div className="grid gap-4 min-[900px]:grid-cols-2">
            <Card title="Rounds por semana" note="Oito semanas, a última é a atual" className="v-panel-lg">
              <AreaChart data={WEEKLY} xDataKey="date" aspectRatio="16 / 10" margin={{ top: 16, right: 28, bottom: 28, left: 28 }}>
                <Grid horizontal />
                <Area dataKey="rounds" fill="var(--chart-line-primary)" fillOpacity={0.3} />
                <XAxis />
                <ChartTooltip />
              </AreaChart>
            </Card>

            <Card title="Armas por lado" note="Onde os abates vêm, de 0 a 100" className="v-panel-lg">
              <div className="mx-auto max-w-[360px]">
                <RadarChart data={SIDES} metrics={WEAPONS} margin={44}>
                  <RadarGrid />
                  <RadarAxis />
                  <RadarLabels />
                  {SIDES.map((s, i) => (
                    <RadarArea key={s.label} index={i} />
                  ))}
                </RadarChart>
              </div>
              <p className="flex justify-center gap-4 pt-1 text-caption font-semibold">
                <span className="inline-flex items-center gap-1.5 text-side-ct">
                  <span aria-hidden="true" className="size-2 rounded-full bg-side-ct" />
                  CT
                </span>
                <span className="inline-flex items-center gap-1.5 text-side-t">
                  <span aria-hidden="true" className="size-2 rounded-full bg-side-t" />
                  TR
                </span>
              </p>
            </Card>

            <Card title="Cabeça" note="Abates com headshot nesta semana" className="v-panel-lg">
              <div className="mx-auto max-w-[360px]">
                <Gauge value={47} centerValue={47.2} defaultLabel="HS%" suffix="%" totalNotches={36} spacing={30} notchCornerRadius={3} useGradient activeGradient={['#3ddc84', '#ffd24a']} formatOptions={{ maximumFractionDigits: 1 }} />
              </div>
            </Card>

            <Card title="Horas por Modo" note="14,5 h nesta semana" className="v-panel-lg">
              <div className="mx-auto max-w-[300px]">
                <RingChart data={MODES} size={260} strokeWidth={14} ringGap={8} baseInnerRadius={64}>
                  {MODES.map((m, i) => (
                    <Ring key={m.label} index={i} />
                  ))}
                  <RingCenter defaultLabel="Total" suffix=" h" formatOptions={{ maximumFractionDigits: 1 }} />
                </RingChart>
              </div>
            </Card>
          </div>
        </LazyMotion>
      ) : (
        <div aria-hidden="true" className="grid gap-4">
          <div className="v-skel h-[260px] rounded-xl" />
          <div className="grid gap-4 min-[900px]:grid-cols-2">
            <div className="v-skel h-[320px] rounded-xl" />
            <div className="v-skel h-[320px] rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}
