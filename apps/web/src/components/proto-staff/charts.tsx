/*
 * Gráficos do protótipo, em SVG puro (sem biblioteca): a linha fina do Início e as hastes verticais finas por baixo
 * dela. Estáticos: nada anima em loop.
 */

function smooth(points: [number, number][]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0]?.[0]} ${points[0]?.[1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1] as [number, number];
    const [x1, y1] = points[i] as [number, number];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx.toFixed(2)} ${y0.toFixed(2)}, ${mx.toFixed(2)} ${y1.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  return d;
}

const toPoints = (values: number[], width: number, height: number, pad = 2) => {
  const max = Math.max(...values, 1);
  return values.map((v, i): [number, number] => [
    (i / Math.max(1, values.length - 1)) * width,
    height - pad - (v / max) * (height - pad * 2),
  ]);
};

/** A linha pequena de um cartão (as últimas 24 h). */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  return (
    <svg
      className="stp-spark"
      viewBox="0 0 120 40"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path d={smooth(toPoints(values, 120, 40, 3))} />
    </svg>
  );
}

/** A linha fina sobre hastes verticais finas, com o ponto de "agora" na ponta direita. */
export function HairChart({ values, label }: { values: number[]; label: string }) {
  const width = 600;
  const height = 200;
  const points = toPoints(values, width, height, 6);
  const stems = 72;
  const sampled = Array.from({ length: stems }, (_, i) => {
    const t = (i / (stems - 1)) * (values.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(values.length - 1, lo + 1);
    const v = (values[lo] as number) * (1 - (t - lo)) + (values[hi] as number) * (t - lo);
    return [(i / (stems - 1)) * width, v] as const;
  });
  const max = Math.max(...values, 1);
  const last = points[points.length - 1] as [number, number];
  return (
    <div className="stp-hair" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {sampled.map(([x, v]) => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1={height - 6 - (v / max) * (height - 12)}
            y2={height}
            opacity={0.55}
          />
        ))}
        <path className="stp-hair-line" d={smooth(points)} />
      </svg>
      <span
        className="stp-hair-now"
        style={{ top: `${(last[1] / height) * 100}%` }}
        aria-hidden="true"
      />
      <span
        className="stp-hair-tip"
        style={{ top: `${(last[1] / height) * 100}%` }}
        aria-hidden="true"
      >
        {values[values.length - 1]}
        <small>agora</small>
      </span>
    </div>
  );
}
