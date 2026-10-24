'use client';

import { type CSSProperties, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { type ArtChoice, type ArtPair, artSrcSet, artUrl } from './map-art';

/**
 * Parte de navegador da arte dos mapas (a pura está em `map-art.ts`). Nada aqui importa o `map-art.json`: o
 * servidor escolhe a variante do dia (`artPair`, `artTable`) e passa o resultado como prop, e o navegador só
 * troca entre a clara e a escura quando o tema muda.
 */

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

/** A escolha para o tema de agora. */
export function useArtChoice(pair: ArtPair | null | undefined): ArtChoice | null {
  const night = useNight();
  if (!pair) return null;
  return night ? pair.night : pair.day;
}

/**
 * A arte do mapa como <picture> (AVIF e WebP, com a cor média de fundo enquanto carrega). Sem arte para o mapa,
 * nada. `sizes` diz quanto da janela a imagem ocupa; `priority` marca as da primeira tela.
 */
export function MapPicture({
  map,
  art,
  sizes = '(min-width: 1280px) 640px, 100vw',
  priority = false,
  className,
  imgClassName,
  imgStyle,
}: {
  map: string;
  /** O par escolhido no servidor (`artPair(map)` ou uma linha de `artTable()`). */
  art: ArtPair | null | undefined;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  imgStyle?: CSSProperties;
}) {
  const choice = useArtChoice(art);
  if (!choice) return null;
  return (
    <picture
      className={cn('block overflow-hidden', className)}
      style={{ backgroundColor: choice.average }}
    >
      <source type="image/avif" srcSet={artSrcSet(map, choice.id, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={artSrcSet(map, choice.id, 'webp')} sizes={sizes} />
      <img
        key={`${map}-${choice.id}`}
        src={artUrl(map, choice.id)}
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
