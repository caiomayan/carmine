'use client';

import { domMax, LazyMotion } from 'framer-motion';
import { AreaSparkline } from '@/components/bklit/charts/sparkline';

/**
 * Sparkline do bklit-ui (MIT) para os números do Perfil: a tendência das últimas 8 semanas, no tamanho de uma
 * linha. Carregado sob demanda junto com os outros gráficos; o `LazyMotion` próprio é porque o do site é `strict`.
 */
export default function ProfileSpark({ values, color = 'var(--chart-line-primary)', label }: { values: number[]; color?: string; label: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <LazyMotion features={domMax}>
      <div className="v-charts h-8 w-full max-w-[160px]">
        <AreaSparkline data={data} dataKey="v" color={color} height={32} fillOpacity={0.25} aria-label={label} />
      </div>
    </LazyMotion>
  );
}
