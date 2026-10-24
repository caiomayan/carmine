'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import catalog from './map-art.json';

/**
 * Arte dos mapas (telas de carregamento do CS2, otimizadas por `scripts/maps-art.mjs` em AVIF e WebP de 480,
 * 960 e 1600 px, com blurDataURL e as cores vivas já extraídas da imagem e gravadas em `map-art.json`).
 *  - Cada mapa tem várias variantes; a escolhida é estável por dia (não muda a cada render).
 *  - No tema escuro, as variantes `_night` são preferidas quando existem.
 */
export type ArtVariant = {
  id: string;
  night: boolean;
  blur: string;
  colors: string[];
  average: string;
  light: number;
};

const CATALOG = catalog as unknown as Record<string, ArtVariant[]>;
const WIDTHS = [480, 960, 1600] as const;

/** O dia de hoje (UTC), a chave da variação diária. */
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hasMapArt(map: string): boolean {
  return (CATALOG[map]?.length ?? 0) > 0;
}

/** A variante do dia para o mapa; `night` prefere as noturnas (tema escuro). */
export function pickVariant(map: string, night: boolean, day = dayKey()): ArtVariant | null {
  const all = CATALOG[map];
  if (!all?.length) return null;
  const nights = all.filter((v) => v.night);
  const days = all.filter((v) => !v.night);
  const pool = night && nights.length ? nights : days.length ? days : all;
  return pool[hash(`${map}:${day}`) % pool.length] ?? null;
}

export const artUrl = (map: string, id: string, width: (typeof WIDTHS)[number] = 1600, ext: 'webp' | 'avif' = 'webp') =>
  `/maps/${map}/${id}-${width}.${ext}`;

const srcSet = (map: string, id: string, ext: 'webp' | 'avif') =>
  WIDTHS.map((w) => `${artUrl(map, id, w, ext)} ${w}w`).join(', ');

/** Tema escuro? Segue `html[data-theme]` (o servidor assume escuro, o padrão do site). */
function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
export function useNight(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme !== 'light',
    () => true,
  );
}

/** As cores vivas extraídas do mapa (3), da variante do dia (a mesma que a imagem mostra). */
export function mapPalette(map: string, night: boolean): [string, string, string] {
  const colors = pickVariant(map, night)?.colors ?? ['#888888'];
  return [colors[0] ?? '#888', colors[1] ?? colors[0] ?? '#888', colors[2] ?? colors[1] ?? colors[0] ?? '#888'];
}

/**
 * A arte do mapa como <picture> (AVIF, WebP e o blur de fundo enquanto carrega). Sem arte para o mapa, nada.
 * `sizes` diz quanto da janela a imagem ocupa; `priority` marca as da primeira tela.
 */
export function MapPicture({
  map,
  sizes = '(min-width: 1280px) 640px, 100vw',
  priority = false,
  className,
  imgClassName,
  imgStyle,
}: {
  map: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  imgStyle?: React.CSSProperties;
}) {
  const night = useNight();
  const variant = pickVariant(map, night);
  if (!variant) return null;
  return (
    <picture
      className={cn('block overflow-hidden', className)}
      style={{ backgroundImage: `url(${variant.blur})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <source type="image/avif" srcSet={srcSet(map, variant.id, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(map, variant.id, 'webp')} sizes={sizes} />
      {/* biome-ignore lint/performance/noImgElement: arte local do mapa, já otimizada no build */}
      <img
        key={`${map}-${variant.id}`}
        src={artUrl(map, variant.id)}
        alt=""
        width={1600}
        height={900}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={cn('size-full object-cover', imgClassName)}
        style={imgStyle}
      />
    </picture>
  );
}
