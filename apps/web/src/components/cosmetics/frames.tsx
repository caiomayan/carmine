import type { CSSProperties } from 'react';
import type { FrameId } from './catalog';

/**
 * As 8 molduras de avatar. Cada uma é uma camada que cobre a caixa do avatar e passa da borda dele
 * (inset negativo em cosmetics.css): um anel de metal feito de `conic-gradient` mascarado, mais SVG
 * onde há forma (coroa, chamas, fios). Tudo CSS/SVG pequeno, sem imagem. As partes que se mexem
 * levam `data-a`: o CSS as pausa fora do hover nas listas e as desliga com movimento reduzido.
 *
 * Coordenadas: a caixa tem 100 × 100 e o avatar é o disco de raio 32 no centro.
 */

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Um ponto na circunferência de raio `r` (centro 50,50), ângulo em graus (0° = direita, horário). */
function at(angle: number, r: number) {
  const rad = (angle * Math.PI) / 180;
  // Arredondado: o servidor e o navegador não calculam o último dígito do cosseno igual (hidratação).
  return { x: round(50 + r * Math.cos(rad)), y: round(50 + r * Math.sin(rad)) };
}

function Steel() {
  return (
    <>
      <i className="cos-ring cos-steel-base" />
      <i className="cos-ring cos-steel-grain" />
      <i className="cos-ring cos-steel-edge" />
    </>
  );
}

function Graphite() {
  return (
    <>
      <i className="cos-ring cos-graphite-base" />
      <i className="cos-ring cos-graphite-grooves" />
      <i className="cos-ring cos-graphite-edge" />
    </>
  );
}

function Founder() {
  const studs = [270, 0, 90, 180].map((angle) => at(angle, 34));
  return (
    <>
      <i className="cos-ring cos-bronze-base" />
      <i className="cos-ring cos-bronze-edge" />
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="cos-stud" cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffe3b0" />
            <stop offset="0.55" stopColor="#c47a2b" />
            <stop offset="1" stopColor="#6b3a10" />
          </radialGradient>
          <linearGradient id="cos-plate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e9b074" />
            <stop offset="1" stopColor="#9a5a1f" />
          </linearGradient>
        </defs>
        {studs.map((p) => (
          <circle
            key={`${p.x}-${p.y}`}
            cx={p.x}
            cy={p.y}
            r="2.3"
            fill="url(#cos-stud)"
            stroke="#5a300c"
            strokeWidth="0.4"
          />
        ))}
        <rect
          x="40"
          y="82.5"
          width="20"
          height="10.5"
          rx="3"
          fill="url(#cos-plate)"
          stroke="#5a300c"
          strokeWidth="0.5"
        />
        <text
          x="50"
          y="90.6"
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fill="#3a1f08"
          fontFamily="Georgia, serif"
        >
          β
        </text>
      </svg>
    </>
  );
}

function Gold() {
  return (
    <>
      <i className="cos-ring cos-gold-base" />
      <i className="cos-ring cos-gold-edge" />
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="cos-crown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff0b3" />
            <stop offset="0.5" stopColor="#f2b705" />
            <stop offset="1" stopColor="#a86d00" />
          </linearGradient>
        </defs>
        <path
          d="M35 17 L37.5 4.5 L44 11 L50 1.5 L56 11 L62.5 4.5 L65 17 Q50 20.5 35 17 Z"
          fill="url(#cos-crown)"
          stroke="#7a4b00"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="13.5" r="1.7" fill="#ff4d6d" stroke="#7a4b00" strokeWidth="0.3" />
        <circle cx="42.5" cy="14.6" r="1.1" fill="#7ad7ff" stroke="#7a4b00" strokeWidth="0.3" />
        <circle cx="57.5" cy="14.6" r="1.1" fill="#7ad7ff" stroke="#7a4b00" strokeWidth="0.3" />
      </svg>
    </>
  );
}

/** Nuvens de fumaça sobre a borda: giram juntas e cada uma respira no seu ritmo. */
const PUFFS = [
  { angle: 10, size: 24, delay: 0 },
  { angle: 62, size: 19, delay: -1.2 },
  { angle: 115, size: 25, delay: -2.1 },
  { angle: 170, size: 20, delay: -0.6 },
  { angle: 222, size: 24, delay: -1.8 },
  { angle: 275, size: 19, delay: -2.7 },
  { angle: 322, size: 23, delay: -0.3 },
];

function Smoke() {
  return (
    <>
      <i className="cos-ring cos-smoke-haze" data-a="haze" />
      <span className="cos-puffs" data-a="spin">
        {PUFFS.map((puff) => {
          const p = at(puff.angle, 35.5);
          return (
            <i
              key={puff.angle}
              data-a="breathe"
              style={
                {
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${puff.size}%`,
                  height: `${puff.size}%`,
                  animationDelay: `${puff.delay}s`,
                } as CSSProperties
              }
            />
          );
        })}
      </span>
    </>
  );
}

/** Línguas de fogo ao redor da borda: ângulo, comprimento e atraso do tremor de cada uma. */
const FLAMES = [
  // Para cima (o fogo sobe): as línguas altas, em cacho.
  [-92, 23, 0],
  [-113, 17, -0.4],
  [-69, 19, -0.9],
  [-136, 13, -0.2],
  [-47, 14, -0.7],
  // Dos lados, mais baixas.
  [-162, 11, -1.1],
  [-20, 12, -0.5],
  [172, 8, -0.3],
  [8, 9, -0.8],
  // Embaixo, só brasa.
  [132, 9, -0.1],
  [56, 8, -1.0],
  [96, 6, -0.6],
] as const;

function flamePath(length: number, width: number) {
  const half = width / 2;
  // A ponta se inclina no sentido horário (a chama lambe a borda em vez de irradiar como um sol).
  const lean = round(length * 0.34);
  return `M${-half} 0 C${-half} ${round(-length * 0.4)} ${round(lean * 0.2 - half)} ${round(-length * 0.62)} ${lean} ${-length} C${round(lean * 0.95 + half * 0.5)} ${round(-length * 0.5)} ${half} ${round(-length * 0.3)} ${half} 0 Z`;
}

function Molotov() {
  return (
    <>
      <i className="cos-ring cos-molotov-base" />
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="cos-flames">
        <defs>
          <linearGradient id="cos-flame-outer" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ff9a1f" />
            <stop offset="0.55" stopColor="#ff4d0a" />
            <stop offset="1" stopColor="#c21500" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cos-flame-inner" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#fff2a8" />
            <stop offset="0.6" stopColor="#ffc233" />
            <stop offset="1" stopColor="#ff8a00" stopOpacity="0" />
          </linearGradient>
        </defs>
        {FLAMES.map(([angle, length, delay]) => (
          <g key={angle} transform={`translate(50 50) rotate(${angle + 90}) translate(0 -33.5)`}>
            <path
              data-a="flicker"
              className="cos-flame"
              d={flamePath(length, 8.6)}
              fill="url(#cos-flame-outer)"
              style={{ animationDelay: `${delay}s` }}
            />
            <path
              data-a="flicker"
              className="cos-flame cos-flame-core"
              d={flamePath(length * 0.62, 4.4)}
              fill="url(#cos-flame-inner)"
              style={{ animationDelay: `${delay - 0.25}s` }}
            />
          </g>
        ))}
      </svg>
    </>
  );
}

function Doppler() {
  return (
    <>
      <i className="cos-ring cos-doppler-base" data-a="spin-slow" />
      <i className="cos-ring cos-doppler-sheen" data-a="spin-back" />
      <i className="cos-ring cos-doppler-edge" />
    </>
  );
}

function C4() {
  const ticks = Array.from({ length: 24 }, (_, index) => index);
  return (
    <>
      <i className="cos-ring cos-c4-base" />
      <i className="cos-ring cos-c4-ticks" />
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="cos-c4-svg">
        <g data-a="sway" className="cos-wires" fill="none" strokeLinecap="round" strokeWidth="1.7">
          <path d="M27 78 C20 88 8 86 10 74 C11 68 6 66 7 60" stroke="#e5334d" />
          <path d="M34 85 C31 96 17 96 14 90" stroke="#3b82f6" />
          <path d="M71 85 C74 96 88 94 90 84 C91 78 86 74 90 68" stroke="#f5c518" />
          <path d="M77 78 C85 87 95 82 92 72" stroke="#22c55e" />
        </g>
        <rect
          x="38.5"
          y="82.2"
          width="23"
          height="10.8"
          rx="2.4"
          fill="#0a0b09"
          stroke="#454a41"
          strokeWidth="0.6"
        />
        <text
          x="50"
          y="90.4"
          textAnchor="middle"
          fontSize="7.4"
          fontWeight="700"
          fill="#ff2a2a"
          fontFamily="ui-monospace, Consolas, monospace"
          className="cos-lcd"
        >
          0<tspan data-a="blink-slow">:</tspan>
          40
        </text>
        <circle
          cx="50"
          cy="15.5"
          r="4.4"
          fill="#ff1f3d"
          opacity="0.28"
          data-a="blink"
          className="cos-led-glow"
        />
        <circle
          cx="50"
          cy="15.5"
          r="2.5"
          fill="#ff3b52"
          stroke="#5a0a16"
          strokeWidth="0.5"
          data-a="blink"
          className="cos-led"
        />
        {ticks.map((index) => {
          const a = at(index * 15, 36.2);
          return <circle key={index} cx={a.x} cy={a.y} r="0.45" fill="#8a9084" />;
        })}
      </svg>
    </>
  );
}

const FRAME_ART: Record<FrameId, () => React.ReactElement> = {
  aco: Steel,
  grafite: Graphite,
  fundador: Founder,
  ouro: Gold,
  fumaca: Smoke,
  molotov: Molotov,
  doppler: Doppler,
  c4: C4,
};

/** A camada da moldura (sem o avatar): `CosmeticAvatar` a põe por cima do rosto. */
export function FrameArt({ frame }: { frame: FrameId }) {
  const Art = FRAME_ART[frame];
  return (
    <span className="cos-art" data-frame={frame} aria-hidden="true">
      <Art />
    </span>
  );
}
