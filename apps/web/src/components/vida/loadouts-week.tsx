'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LOADOUTS_WEEK, PEOPLE, type SkinInfo } from './data';
import { Face } from './face';
import { SkinCard } from './skin-card';

const ROTATE_MS = 7000;

/**
 * "Loadouts da semana": uma vitrine que gira sozinha com as skins equipadas por jogadores de verdade.
 * É o lugar do site onde a cor das skins aparece grande; o fundo da faixa troca para a paleta da skin
 * em foco. A rotação pausa com o mouse ou o foco e tem botão de pausa (WCAG 2.2.2); com movimento
 * reduzido não há rotação.
 */
export default function LoadoutsWeek({ skins }: { skins: Record<number, SkinInfo> }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);
  const item = LOADOUTS_WEEK[index] ?? LOADOUTS_WEEK[0];
  const skin = item ? skins[item.skin] : undefined;
  if (!item || !skin) return null;
  const person = PEOPLE[item.person];
  const [c1, c2, c3] = skin.colors;
  const stopped = paused || hold;

  return (
    <section
      aria-labelledby="vida-loadouts"
      data-testid="vida-loadouts"
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
      style={
        {
          '--amb-1': c1,
          '--amb-2': c2,
          '--amb-3': c3,
          '--v-band': `radial-gradient(60% 100% at 22% 48%, color-mix(in srgb, var(--amb-1) 34%, transparent), transparent 72%), radial-gradient(50% 90% at 82% 62%, color-mix(in srgb, var(--amb-2) 26%, transparent), transparent 72%), radial-gradient(40% 70% at 55% 0%, color-mix(in srgb, var(--amb-3) 18%, transparent), transparent 70%), var(--surface)`,
        } as React.CSSProperties
      }
      className="v-band v-amb-trans mt-4 py-12 max-md:py-9"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6">
        <div className="grid gap-1.5">
          <h2 id="vida-loadouts" className="v-title">
            Loadouts da semana
          </h2>
          <p className="max-w-[56ch] text-body-sm text-muted-foreground">
            O que jogadores reais estão usando nos servidores. A skin muda a cor da vitrine.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
          className="v-cta-quiet"
        >
          {paused ? 'Retomar rotação' : 'Pausar rotação'}
        </button>
      </div>

      <div className="grid items-stretch gap-5 min-[1000px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div key={index} className="v-swap">
          <SkinCard
            skin={skin}
            equip
            statTrak={item.statTrak}
            sides={item.sides}
            size="lg"
            className="h-full min-h-[420px]"
            meta={
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  {person ? <Face name={person.name} hue={person.hue} size={20} /> : null}
                  {person?.name}
                </span>
                <span aria-hidden="true">·</span>
                <span>{item.server}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {item.wear} {item.float}
                </span>
              </span>
            }
          />
        </div>

        <ul
          aria-label="Escolher o Loadout"
          className="flex gap-2.5 overflow-x-auto pb-1 max-[999px]:snap-x min-[1000px]:grid min-[1000px]:grid-cols-2 min-[1000px]:overflow-visible"
        >
          {LOADOUTS_WEEK.map((l, i) => {
            const s = skins[l.skin];
            const p = PEOPLE[l.person];
            if (!s) return null;
            const active = i === index;
            return (
              <li key={l.skin} className="max-[999px]:w-[168px] max-[999px]:shrink-0 max-[999px]:snap-start">
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`${s.title} ${s.subtitle ?? ''}, de ${p?.name}`}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'v-spot relative grid h-full w-full gap-1 overflow-hidden rounded-xl p-3 text-left transition-colors duration-(--dur-base)',
                    active ? 'bg-(--fill-active)' : 'bg-(--fill-rest) hover:bg-(--fill-hover)',
                  )}
                >
                  {/* biome-ignore lint/performance/noImgElement: imagem externa da CDN */}
                  <img
                    src={s.image}
                    alt=""
                    loading="lazy"
                    className="h-[64px] w-full object-contain drop-shadow-[0_8px_10px_rgb(0_0_0/0.4)]"
                  />
                  <span className="truncate text-caption text-muted-foreground">{s.title}</span>
                  <span className="truncate text-body-sm font-bold">{s.subtitle ?? s.title}</span>
                  <span className="flex items-center gap-1.5 truncate text-caption text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ background: `var(--rarity-${s.rarity})` }}
                    />
                    {p?.name}
                  </span>
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-[3px] bg-(--fill-hover)"
                    >
                      <span
                        key={index}
                        className="v-prog block h-full bg-(--v-brand)"
                        style={{
                          animationDuration: `${ROTATE_MS}ms`,
                          animationPlayState: stopped ? 'paused' : 'running',
                        }}
                        onAnimationEnd={() => setIndex((n) => (n + 1) % LOADOUTS_WEEK.length)}
                      />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
