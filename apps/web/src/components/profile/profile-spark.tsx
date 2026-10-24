'use client';

import { domMax, LazyMotion } from 'framer-motion';
import { AreaSparkline } from '@/components/bklit/charts/sparkline';

/**
 * Sparkline do bklit-ui (MIT) para os números do Perfil: a tendência das últimas semanas, no tamanho de uma
 * linha. Carregado sob demanda; o `LazyMotion` próprio é porque o do site é `strict` e os gráficos usam o
 * `motion` completo.
 */
export default function ProfileSpark({ values, label }: { values: number[]; label: string }) {
  const data = values.map((value, index) => ({ i: index, v: value }));
  return (
    <LazyMotion features={domMax}>
      <div className="pf-charts h-8 w-full max-w-[160px]">
        <AreaSparkline
          data={data}
          dataKey="v"
          color="var(--chart-line-primary)"
          height={32}
          fillOpacity={0.25}
          aria-label={label}
        />
      </div>
    </LazyMotion>
  );
}
