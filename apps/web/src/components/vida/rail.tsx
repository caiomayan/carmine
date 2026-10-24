'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { AnimatePresence, m } from 'framer-motion';
import { type ReactNode, useEffect, useRef, useState, ViewTransition } from 'react';
import { StatusDot } from '@/components/status-dot';
import { cn } from '@/lib/utils';
import {
  ACTIVITY_POOL,
  type DemoActivity,
  FRIENDS_NOW,
  type HomeState,
  type Mode,
  PEOPLE,
  type SkinInfo,
  serversFor,
  TOP3,
  TOP3_UNIT,
} from './data';
import { DynamicButton } from './dynamic-button';
import { EmptyScene } from './empty-scene';
import { Face } from './face';
import { Ticker } from './ticker';

/** Painel do trilho: título, apoio opcional e o conteúdo. */
function Panel({
  title,
  aside,
  children,
  className,
  testId,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className={cn('v-panel v-panel-lg v-spot p-5 max-md:p-4', className)}>
      <header className="flex items-center justify-between gap-3 pb-3.5">
        <h2 className="inline-flex items-center gap-2.5 label-caps text-foreground">
          <span aria-hidden="true" className="size-1.5 rotate-45 bg-(--v-brand)" />
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

const PROFILE = '/proto/perfil' as Route;

/* ------------------------------------------------------------------ amigos */

export function FriendsPanel({ state, className }: { state: HomeState; className?: string }) {
  const servers = serversFor(state);
  const byId = new Map(servers.map((s) => [s.id, s]));
  const live = state === 'amigos';

  return (
    <Panel
      testId="vida-friends"
      className={className}
      title="Amigos jogando agora"
      aside={
        live ? (
          <span className="rounded-md bg-(--fill-active) px-2 py-1 text-caption font-bold tabular-nums">
            {FRIENDS_NOW.length}
          </span>
        ) : null
      }
    >
      {live ? (
        <ul className="grid gap-1">
          {FRIENDS_NOW.map((f, i) => {
            const person = PEOPLE[f.person];
            const server = byId.get(f.serverId);
            if (!person || !server) return null;
            const face = <Face name={person.name} hue={person.hue} size={40} live />;
            return (
              <li
                key={f.person}
                style={{ '--i': i } as React.CSSProperties}
                className="enter-stagger v-inner flex items-center gap-3 p-1.5 transition-colors duration-(--dur-fast) hover:bg-(--fill-hover)"
              >
                <Link
                  href={PROFILE}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
                  aria-label={`Perfil de ${person.name}`}
                >
                  {f.person === 'lia' ? (
                    <ViewTransition name="face-lia" share="v-face">
                      {face}
                    </ViewTransition>
                  ) : (
                    face
                  )}
                  <span className="grid min-w-0">
                    <span className="truncate text-body font-semibold">{person.name}</span>
                    <span className="truncate text-caption text-muted-foreground">
                      {server.name} · {server.map[0]?.toUpperCase()}
                      {server.map.slice(1)}
                    </span>
                  </span>
                </Link>
                <DynamicButton idle="Entrar junto" loading="Conectando" done="Conectado" className="v-pill min-h-9! px-3.5! text-[14px]! max-md:min-h-(--tap)!" />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid justify-items-center gap-3 py-2 text-center">
          <EmptyScene kind="friends" />
          <p className="text-md font-semibold">
            {state === 'deslogado' ? 'Veja onde os seus amigos jogam' : 'Nenhum amigo jogando agora'}
          </p>
          <p className="max-w-[34ch] text-body-sm text-muted-foreground">
            {state === 'deslogado'
              ? 'Entre com a Steam e os amigos que estão num Servidor Carmine aparecem aqui, com o botão para entrar junto.'
              : state === 'offline'
                ? 'Ninguém está nos servidores agora. Quando um amigo seu entrar, ele aparece aqui.'
                : 'Quando um amigo seu da Steam entrar num Servidor Carmine, ele aparece aqui com o botão para entrar junto.'}
          </p>
          {state === 'deslogado' ? (
            <a href="#entrar" className="v-cta-quiet mt-1">
              Entrar com a Steam
            </a>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ atividade */

type Row = { key: number; ev: DemoActivity; born: number; fresh: boolean; flash?: boolean };

function ageLabel(seconds: number, live: boolean): string {
  if (!live) return seconds < 3600 ? `há ${Math.round(seconds / 60)} min` : `há ${Math.round(seconds / 3600)} h`;
  if (seconds < 8) return 'agora';
  if (seconds < 60) return `há ${Math.round(seconds)} s`;
  return `há ${Math.round(seconds / 60)} min`;
}

function describe(ev: DemoActivity, skins: Record<number, SkinInfo>): { what: ReactNode; sub: ReactNode } {
  switch (ev.type) {
    case 'multi_kill':
      return {
        what: (
          <>
            fez <b className="tabular-nums">{ev.kills} abates</b> num round
          </>
        ),
        sub: ev.server,
      };
    case 'skin_equipped': {
      const skin = skins[ev.skin];
      return {
        what: 'equipou uma skin',
        sub: skin ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: `var(--rarity-${skin.rarity})` }}
            />
            {skin.title} | {skin.subtitle}
          </span>
        ) : (
          'Item'
        ),
      };
    }
    case 'joined':
      return { what: 'entrou no servidor', sub: ev.server };
    case 'new_leader':
      return {
        what: 'assumiu a liderança',
        sub: ev.mode === 'retake' ? 'Ranking de Retake da semana' : 'Ranking de Deathmatch da semana',
      };
  }
}

const INITIAL_AGES = [14, 52, 131, 262, 540];

export function FeedPanel({
  skins,
  live,
  className,
}: {
  skins: Record<number, SkinInfo>;
  live: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const next = useRef(INITIAL_AGES.length);
  const counter = useRef(INITIAL_AGES.length);
  const [now, setNow] = useState(() => Date.now());
  const [rows, setRows] = useState<Row[]>(() =>
    INITIAL_AGES.map((age, i) => ({
      key: i,
      ev: ACTIVITY_POOL[i] as DemoActivity,
      born: Date.now() - (live ? age : age * 12) * 1000,
      fresh: false,
    })),
  );

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      const ev = ACTIVITY_POOL[next.current % ACTIVITY_POOL.length] as DemoActivity;
      next.current += 1;
      counter.current += 1;
      const key = counter.current;
      setRows((prev) => [{ key, ev, born: Date.now(), fresh: true, flash: true }, ...prev].slice(0, 6));
      // Na próxima pintura o item abre (de 0fr para 1fr) e entra empurrando os outros.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setRows((prev) => prev.map((r) => (r.key === key ? { ...r, fresh: false } : r))),
        ),
      );
    }, 4600);
    return () => clearInterval(timer);
  }, [live]);

  return (
    <Panel
      testId="vida-feed"
      className={className}
      title={live ? 'Ao vivo agora' : 'Atividade recente'}
      aside={
        live ? (
          <span className="inline-flex items-center gap-2 text-caption font-semibold text-muted-foreground">
            <StatusDot tone="online" pulse />
            em tempo real
          </span>
        ) : null
      }
    >
      <ul className="grid" aria-label="Atividade dos jogadores">
        <AnimatePresence initial={false}>
        {rows.map((row, rowIndex) => {
          const person = PEOPLE[row.ev.person];
          if (!person) return null;
          const { what, sub } = describe(row.ev, skins);
          const age = Math.max(0, (now - row.born) / 1000);
          return (
            <m.li
              key={row.key}
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 40 }}
              style={{ originY: 0 }}
              className={cn(!expanded && rowIndex >= 4 && 'max-md:hidden')}
            >
              <div
                className={cn('v-inner flex items-center gap-3 px-1.5 py-2', row.flash && 'v-feed-flash')}
              >
                  <Face name={person.name} hue={person.hue} size={34} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-body-sm">
                      <b className="font-semibold">{person.name}</b>{' '}
                      <span className="text-muted-foreground">{what}</span>
                    </span>
                    <span className="truncate text-caption text-muted-foreground">{sub}</span>
                  </span>
                  <time suppressHydrationWarning className="shrink-0 text-caption text-faint tabular-nums">
                    {ageLabel(age, live)}
                  </time>
              </div>
            </m.li>
          );
        })}
        </AnimatePresence>
      </ul>
      {rows.length > 4 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="v-pill mt-2 min-h-(--tap) w-full bg-(--fill-rest) text-body-sm font-semibold hover:bg-(--fill-hover) md:hidden"
        >
          {expanded ? 'Ver menos' : 'Ver mais'}
        </button>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ top 3 */

export function TopPanel({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>('retake');
  const rows = TOP3[mode];
  return (
    <Panel
      testId="vida-top3"
      className={className}
      title="Top 3 da semana"
      aside={
        <div role="tablist" aria-label="Modo" className="flex rounded-full bg-(--fill-rest) p-0.5">
          {(['retake', 'deathmatch'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'min-h-7 rounded-full px-3 text-caption font-semibold text-muted-foreground transition-colors duration-(--dur-fast) max-md:min-h-(--tap)',
                mode === m && 'bg-(--fill-active) text-foreground',
              )}
            >
              {m === 'retake' ? 'Retake' : 'DM'}
            </button>
          ))}
        </div>
      }
    >
      <ol className="grid gap-1">
        {rows.map((row, i) => {
          const person = PEOPLE[row.person];
          if (!person) return null;
          const decimals = mode === 'deathmatch' ? 2 : 0;
          const num = Number(row.value.replace(',', '.'));
          return (
            <li key={row.person}>
              <Link
                href={PROFILE}
                className="v-inner flex items-center gap-3 p-1.5 transition-colors duration-(--dur-fast) hover:bg-(--fill-hover)"
              >
                <span
                  className="v-sign w-8 text-center text-[40px]"
                  style={{ color: i === 0 ? 'var(--text)' : 'var(--muted)' }}
                >
                  {i + 1}
                </span>
                <Face name={person.name} hue={person.hue} size={34} />
                <span className="min-w-0 flex-1 truncate text-body font-semibold">{person.name}</span>
                <span className="text-right">
                  <Ticker
                    value={num}
                    decimals={decimals}
                    className="v-sign text-[30px] text-foreground"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-caption text-muted-foreground">{TOP3_UNIT[mode]}</p>
        <Link
          href={'/proto/ranking' as Route}
          className="inline-flex min-h-6 items-center text-caption font-semibold text-foreground underline-offset-4 hover:underline"
        >
          Ver o Ranking
        </Link>
      </div>
    </Panel>
  );
}
