'use client';

import { AnimatePresence, LayoutGroup, m } from 'framer-motion';
import type { Route } from 'next';
import Link from 'next/link';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { publishLiveSummary } from '@/lib/servers';
import { cn } from '@/lib/utils';
import { WeekCountdown } from './countdown';
import { type Mode, PEOPLE } from './data';
import { Effects } from './effects';
import { Face } from './face';
import { setFooterMap } from './footer-fx';
import { MapPicture, mapPalette, useNight } from './map-art';
import { Ticker } from './ticker';

/**
 * Ranking do protótipo "vida": pódio com o top 3 e tabela do 4º em diante, com troca de posição animada. As
 * trocas usam o layout do motion (FLIP): quando alguém passa o de cima, as duas linhas trocam de lugar deslizando,
 * e o pódio troca o nome do degrau com um rolo. Os números mudam a cada poucos segundos (simulação) para mostrar
 * o efeito; "Partida" não existe: Retake conta rounds ganhos e Deathmatch, abates por minuto (CONTEXT.md).
 */

type Row = { id: string; score: number; delta: number; moved: number };

const START: Record<Mode, [string, number][]> = {
  retake: [
    ['kuririn', 412],
    ['lia', 388],
    ['ze', 371],
    ['mafalda', 340],
    ['jao', 322],
    ['cacau', 301],
    ['dudu', 288],
    ['nathy', 270],
    ['noite', 255],
    ['duda', 240],
  ],
  deathmatch: [
    ['duda', 2.41],
    ['mafalda', 2.33],
    ['cacau', 2.18],
    ['kuririn', 2.1],
    ['lia', 2.04],
    ['nathy', 1.97],
    ['jao', 1.9],
    ['ze', 1.82],
    ['dudu', 1.75],
    ['noite', 1.66],
  ],
};
const UNIT: Record<Mode, string> = { retake: 'rounds ganhos', deathmatch: 'abates por minuto' };
const MAP_OF: Record<Mode, 'mirage' | 'dust2'> = { retake: 'mirage', deathmatch: 'dust2' };

const seed = (mode: Mode): Row[] => START[mode].map(([id, score]) => ({ id, score, delta: 0, moved: 0 }));
const sorted = (rows: Row[]) => [...rows].sort((a, b) => b.score - a.score);

function useSimulatedRanking(mode: Mode, paused: boolean) {
  const [rows, setRows] = useState<Row[]>(() => seed(mode));
  const prev = useRef(mode);
  useEffect(() => {
    if (prev.current !== mode) {
      prev.current = mode;
      setRows(seed(mode));
    }
  }, [mode]);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setRows((current) => {
        const order = sorted(current);
        const before = new Map(order.map((r, i) => [r.id, i]));
        // Alguém entre o 2º e o 9º sobe: a chance de passar quem está logo acima é alta de propósito.
        const pick = order[1 + Math.floor(Math.random() * 8)];
        if (!pick) return current;
        const above = order[(before.get(pick.id) ?? 1) - 1];
        const gap = above ? above.score - pick.score : 0;
        const bump = mode === 'retake' ? Math.round(gap + 2 + Math.random() * 18) : Number((gap + 0.02 + Math.random() * 0.06).toFixed(2));
        const next = current.map((r) => (r.id === pick.id ? { ...r, score: Number((r.score + bump).toFixed(2)), delta: bump } : { ...r, delta: 0 }));
        const after = new Map(sorted(next).map((r, i) => [r.id, i]));
        return next.map((r) => ({ ...r, moved: (before.get(r.id) ?? 0) - (after.get(r.id) ?? 0) }));
      });
    }, 4200);
    return () => clearInterval(timer);
  }, [mode, paused]);
  return sorted(rows);
}

const fmt = (mode: Mode, score: number) =>
  mode === 'retake' ? String(Math.round(score)) : score.toFixed(2).replace('.', ',');

function Podium({ rows, mode }: { rows: Row[]; mode: Mode }) {
  const order = [1, 0, 2]; // 2º, 1º, 3º
  return (
    <ol className="grid grid-cols-3 items-end gap-3 max-md:gap-2" data-testid="vida-podium" aria-label="Pódio">
      {order.map((slot) => {
        const row = rows[slot];
        const person = row ? PEOPLE[row.id] : undefined;
        if (!row || !person) return null;
        const first = slot === 0;
        return (
          <li
            key={slot}
            data-slot={slot + 1}
            className={cn(
              'v-panel v-panel-lg v-spot relative flex flex-col items-center gap-2 overflow-hidden px-3 pt-6 text-center',
              first ? 'min-h-[330px] max-md:min-h-[260px]' : slot === 1 ? 'min-h-[270px] max-md:min-h-[210px]' : 'min-h-[240px] max-md:min-h-[190px]',
            )}
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 -z-10 h-2/3"
              style={{
                background: `linear-gradient(to top, color-mix(in srgb, hsl(${person.hue} 80% 55%) ${first ? 38 : 24}%, transparent), transparent)`,
              }}
            />
            <span className="v-sign text-[clamp(64px,7vw,104px)] text-foreground">{slot + 1}</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <m.div
                key={row.id}
                initial={{ y: 28, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -28, opacity: 0, filter: 'blur(4px)' }}
                transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                className="grid justify-items-center gap-2 pb-6"
              >
                <Face name={person.name} hue={person.hue} size={first ? 84 : 64} live={first} />
                <Link href={'/proto/perfil' as Route} className="max-w-full truncate text-[17px] font-bold tracking-[-0.02em] hover:underline">
                  {person.name}
                </Link>
                <span className="v-sign text-[clamp(34px,3.4vw,52px)]">
                  <Ticker value={Number(row.score.toFixed(2))} decimals={mode === 'retake' ? 0 : 2} />
                </span>
                <span className="text-caption text-muted-foreground">{UNIT[mode]}</span>
              </m.div>
            </AnimatePresence>
          </li>
        );
      })}
    </ol>
  );
}

export function RankingLive() {
  const [mode, setMode] = useState<Mode>('retake');
  const [paused, setPaused] = useState(false);
  const rows = useSimulatedRanking(mode, paused);
  const night = useNight();
  const map = MAP_OF[mode];
  const [c1, c2, c3] = mapPalette(map, night);
  const rest = rows.slice(3);
  const top = useMemo(() => rows.slice(0, 3), [rows]);

  useEffect(() => setFooterMap(map), [map]);
  useEffect(() => {
    publishLiveSummary({ online: 2, players: 19 } as Parameters<typeof publishLiveSummary>[0]);
  }, []);

  return (
    <div data-vida="on" data-map={map} style={{ '--amb-1': c1, '--amb-2': c2, '--amb-3': c3 } as CSSProperties}>
      <Effects />
      <div aria-hidden="true" className="v-ambient">
        <i />
        <i />
        <i />
      </div>

      <div className="container-page pb-24" data-testid="vida-ranking">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pt-12 pb-8 max-md:pt-8">
          <div className="grid gap-3">
            <h1 className="text-[clamp(40px,5vw,64px)] leading-none font-bold tracking-[-0.04em]">Ranking</h1>
            <p className="text-body-sm text-muted-foreground">19 a 25 de outubro · mínimo da semana: 50 rounds no Retake, 30 min no Deathmatch</p>
            <p className="flex flex-wrap items-baseline gap-x-3 text-caption text-muted-foreground">
              Recomeça em <WeekCountdown className="text-[26px] text-foreground" />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Modo" className="flex rounded-full bg-(--fill-rest) p-1">
              {(['retake', 'deathmatch'] as Mode[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => setMode(id)}
                  className={cn(
                    'min-h-9 rounded-full px-4 text-body-sm font-semibold text-muted-foreground transition-colors duration-(--dur-fast) max-md:min-h-(--tap)',
                    mode === id && 'bg-foreground text-background',
                  )}
                >
                  {id === 'retake' ? 'Retake' : 'Deathmatch'}
                </button>
              ))}
            </div>
            <button type="button" aria-pressed={paused} onClick={() => setPaused((p) => !p)} className="v-cta-quiet">
              {paused ? 'Retomar ao vivo' : 'Pausar ao vivo'}
            </button>
          </div>
        </header>

        <LayoutGroup>
          <Podium rows={top} mode={mode} />

          <ol className="mt-6 grid gap-2" data-testid="vida-table" aria-label="Do 4º ao 10º">
            <AnimatePresence initial={false}>
              {rest.map((row, i) => {
                const person = PEOPLE[row.id];
                if (!person) return null;
                const moved = row.moved;
                return (
                  <m.li
                    key={`${mode}-${row.id}`}
                    layout="position"
                    transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                    className="v-panel v-spot flex items-center gap-4 bg-surface px-5 py-3 max-md:gap-3 max-md:px-3.5"
                    style={{ borderRadius: 'var(--r-card)' }}
                  >
                    <span className="v-sign w-9 text-center text-[34px]">{i + 4}</span>
                    <Face name={person.name} hue={person.hue} size={40} />
                    <Link href={'/proto/perfil' as Route} className="inline-flex min-h-6 min-w-0 flex-1 items-center truncate text-body font-semibold hover:underline">
                      {person.name}
                    </Link>
                    <span
                      className={cn(
                        'inline-flex min-w-12 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-caption font-bold tabular-nums transition-opacity duration-(--dur-slow)',
                        moved > 0 && 'bg-status-online/20 text-status-online',
                        moved < 0 && 'bg-status-danger/20 text-status-danger',
                        moved === 0 && 'opacity-0',
                      )}
                      aria-label={moved > 0 ? `subiu ${moved}` : moved < 0 ? `caiu ${-moved}` : undefined}
                    >
                      {moved > 0 ? `▲ ${moved}` : moved < 0 ? `▼ ${-moved}` : '·'}
                    </span>
                    <span className="v-sign w-24 text-right text-[32px]">
                      <Ticker value={Number(row.score.toFixed(2))} decimals={mode === 'retake' ? 0 : 2} />
                    </span>
                  </m.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </LayoutGroup>

        <div className="mt-6 flex items-center gap-4 rounded-[var(--r-card)] bg-(--fill-rest) px-5 py-4 text-body-sm text-muted-foreground">
          <MapPicture map={map} sizes="96px" className="size-12 shrink-0 rounded-full" />
          <p>
            Você está em <b className="font-semibold text-foreground">14º</b> no {mode === 'retake' ? 'Retake' : 'Deathmatch'}. Faltam{' '}
            <b className="font-semibold text-foreground tabular-nums">{mode === 'retake' ? '12 rounds' : '8 min'}</b> para passar o 13º.
            Quem tem Perfil privado aparece como “Jogador privado” e ocupa a posição.
          </p>
        </div>
        <p className="sr-only" aria-live="polite">
          {fmt(mode, rows[0]?.score ?? 0)}
        </p>
      </div>
    </div>
  );
}
