'use client';

import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useState } from 'react';
import { holoStyle } from '@/components/vida/skin-ambient';
import { wearTier } from '@/lib/catalog/wear';
import type { LoadoutEntry, LoadoutsWeek as LoadoutsWeekData } from '@/lib/home/types';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from './player-avatar';
import { LoadoutsSkeleton } from './skeleton';

const ROTATE_MS = 7000;

/** A cor do texto sobre a etiqueta de cada raridade (a etiqueta é cheia, na cor da raridade). */
const RARITY_INK: Record<LoadoutEntry['rarity'], string> = {
  consumer: '#0e1116',
  industrial: '#06121f',
  milspec: '#ffffff',
  restricted: '#ffffff',
  classified: '#ffffff',
  covert: '#ffffff',
  contraband: '#1c1405',
};

const isHolo = (rarity: LoadoutEntry['rarity'], statTrak: boolean) =>
  statTrak || rarity === 'covert' || rarity === 'contraband' || rarity === 'classified';

function RarityTag({ rarity }: { rarity: LoadoutEntry['rarity'] }) {
  const t = useTranslations('home.rarity');
  return (
    <span
      style={{ background: `var(--rarity-${rarity})`, color: RARITY_INK[rarity] }}
      className="inline-flex items-center rounded-sm px-2.5 py-[5px] text-[11px] leading-none font-extrabold tracking-[0.14em] uppercase"
    >
      {t(rarity)}
    </span>
  );
}

function SideDots({ sides }: { sides: LoadoutEntry['sides'] }) {
  const t = useTranslations('home.sides');
  return (
    <span className="inline-flex items-center gap-2">
      {sides.includes('ct') ? (
        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-side-ct">
          <span aria-hidden="true" className="size-2 rounded-full bg-side-ct" />
          {t('ct')}
        </span>
      ) : null}
      {sides.includes('t') ? (
        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-side-t">
          <span aria-hidden="true" className="size-2 rounded-full bg-side-t" />
          {t('t')}
        </span>
      ) : null}
    </span>
  );
}

/**
 * O cartão grande da skin: arte sobre um fundo na cor da raridade, inclinação 3D com o ponteiro e, nas raras e
 * StatTrak, o brilho holográfico tingido pela skin (a paleta vem do servidor, nunca do catálogo inteiro).
 */
function SkinCard({ entry }: { entry: LoadoutEntry }) {
  const t = useTranslations('home');
  const format = useFormatter();
  const holo = isHolo(entry.rarity, entry.statTrak);
  const rar = `var(--rarity-${entry.rarity})`;
  const wear =
    entry.wear === null
      ? null
      : `${t(`wear.${wearTier(entry.wear)}`)} ${format.number(entry.wear, {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        })}`;
  return (
    <figure
      data-holo={
        holo ? (entry.rarity === 'contraband' || entry.rarity === 'covert' ? '2' : '1') : undefined
      }
      data-foil={entry.foil ? '' : undefined}
      data-testid="loadout-card"
      style={
        {
          '--rar': rar,
          ...holoStyle(entry.palette, rar, { statTrak: entry.statTrak }),
        } as CSSProperties
      }
      className={cn(
        'v-tilt v-spot relative isolate m-0 flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl bg-surface p-6 max-md:min-h-[360px] max-md:p-4',
        holo && 'v-holo',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(90% 80% at 50% 38%, color-mix(in srgb, ${rar} 42%, transparent), transparent 70%), linear-gradient(180deg, color-mix(in srgb, ${rar} 12%, var(--surface)), var(--surface))`,
        }}
      />
      <div className="flex items-start justify-between gap-2">
        <RarityTag rarity={entry.rarity} />
        {entry.statTrak ? (
          <span className="rounded-sm bg-[#cf6a1f] px-2.5 py-[5px] text-[11px] leading-none font-extrabold tracking-[0.14em] text-white uppercase">
            {t('statTrak')}
          </span>
        ) : null}
      </div>
      <div className="relative grid min-h-[200px] flex-1 place-items-center py-3">
        {/* Arte da skin (CDN da cs2-lib): sem otimização, como no resto do site. */}
        {/* biome-ignore lint/performance/noImgElement: imagem externa da CDN, sem otimização */}
        <img
          src={entry.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="max-h-[260px] w-full transform-[translateZ(46px)] object-contain drop-shadow-[0_18px_22px_rgb(0_0_0/0.45)]"
        />
      </div>
      <figcaption className="grid gap-1">
        <span className="text-caption text-muted-foreground">{entry.title}</span>
        <span className="v-serif text-[48px] leading-none text-foreground max-md:text-[38px]">
          {entry.subtitle ?? entry.title}
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2 text-body-sm text-muted-foreground">
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={entry.player.href}
              className="inline-flex items-center gap-1.5 font-semibold text-foreground underline-offset-4 hover:underline"
            >
              <PlayerAvatar src={entry.player.avatarUrl} name={entry.player.name} size={20} />
              {entry.player.name}
            </Link>
            {wear ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{wear}</span>
              </>
            ) : null}
          </span>
          <SideDots sides={entry.sides} />
        </span>
      </figcaption>
    </figure>
  );
}

/** As três cores da faixa: as da skin, ou a da raridade quando ela não tem paleta. */
function ambient(entry: LoadoutEntry): [string, string, string] {
  const base = `var(--rarity-${entry.rarity})`;
  const a = entry.palette?.[0] ?? base;
  const b = entry.palette?.[1] ?? a;
  const c = entry.palette?.[2] ?? b;
  return [a, b, c];
}

/**
 * "Loadouts da semana": uma vitrine que gira sozinha com a skin em destaque do Loadout de cada um dos melhores da
 * semana (Perfil público). É o lugar do site onde a cor das skins aparece grande; o fundo da faixa troca para a
 * paleta da skin em foco. A rotação pausa com o mouse ou o foco e tem botão de pausa (WCAG 2.2.2); com movimento
 * reduzido não há rotação. Os dados vêm de `/vitrine/semana` quando a faixa chega perto da tela; sem ninguém para
 * mostrar (ou com a API fora), a seção não aparece.
 */
export default function LoadoutsWeek() {
  const t = useTranslations('home.loadouts');
  const [entries, setEntries] = useState<LoadoutEntry[] | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);

  useEffect(() => {
    let stopped = false;
    fetch('/vitrine/semana', { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? (response.json() as Promise<LoadoutsWeekData>) : null))
      .then((data) => {
        if (!stopped) setEntries(data?.entries ?? []);
      })
      .catch(() => {
        if (!stopped) setEntries([]);
      });
    return () => {
      stopped = true;
    };
  }, []);

  if (!entries) return <LoadoutsSkeleton />;
  const entry = entries[index];
  if (!entry) return null;
  const [c1, c2, c3] = ambient(entry);
  const stopped = paused || hold;

  return (
    <section
      aria-labelledby="home-loadouts"
      data-testid="loadouts-week"
      onPointerEnter={() => setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
      style={
        {
          '--amb-1': c1,
          '--amb-2': c2,
          '--amb-3': c3,
          '--vh-band': `radial-gradient(60% 100% at 22% 48%, color-mix(in srgb, var(--amb-1) 34%, transparent), transparent 72%), radial-gradient(50% 90% at 82% 62%, color-mix(in srgb, var(--amb-2) 26%, transparent), transparent 72%), radial-gradient(40% 70% at 55% 0%, color-mix(in srgb, var(--amb-3) 18%, transparent), transparent 70%), var(--surface)`,
        } as CSSProperties
      }
      className="vh-band v-amb-trans mt-4 py-12 max-md:py-9"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6">
        <div className="grid gap-1.5">
          <h2 id="home-loadouts" className="v-title">
            {t('title')}
          </h2>
          <p className="max-w-[56ch] text-body-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {entries.length > 1 ? (
          <button
            type="button"
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
            className="vh-cta-quiet"
          >
            {paused ? t('resume') : t('pause')}
          </button>
        ) : null}
      </div>

      <div className="grid items-stretch gap-5 min-[1000px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div key={entry.key} className="vh-swap">
          <SkinCard entry={entry} />
        </div>

        <ul
          aria-label={t('choose')}
          className="flex gap-2.5 overflow-x-auto pb-1 max-[999px]:snap-x min-[1000px]:grid min-[1000px]:grid-cols-2 min-[1000px]:overflow-visible"
        >
          {entries.map((item, i) => {
            const active = i === index;
            return (
              <li
                key={item.key}
                className="max-[999px]:w-[168px] max-[999px]:shrink-0 max-[999px]:snap-start"
              >
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={t('pick', {
                    skin: item.subtitle ?? item.title,
                    weapon: item.title,
                    name: item.player.name,
                  })}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'v-spot relative grid h-full w-full gap-1 overflow-hidden rounded-xl p-3 text-left transition-colors duration-(--dur-base)',
                    active ? 'bg-(--fill-active)' : 'bg-(--fill-rest) hover:bg-(--fill-hover)',
                  )}
                >
                  {/* biome-ignore lint/performance/noImgElement: imagem externa da CDN, sem otimização */}
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    className="h-[64px] w-full object-contain drop-shadow-[0_8px_10px_rgb(0_0_0/0.4)]"
                  />
                  <span className="truncate text-caption text-muted-foreground">{item.title}</span>
                  <span className="truncate text-body-sm font-bold">
                    {item.subtitle ?? item.title}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-caption text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ background: `var(--rarity-${item.rarity})` }}
                    />
                    {item.player.name}
                  </span>
                  {active && entries.length > 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-[3px] bg-(--fill-hover)"
                    >
                      <span
                        key={index}
                        className="vh-prog block h-full bg-foreground"
                        style={{
                          animationDuration: `${ROTATE_MS}ms`,
                          animationPlayState: stopped ? 'paused' : 'running',
                        }}
                        onAnimationEnd={() => setIndex((n) => (n + 1) % entries.length)}
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
