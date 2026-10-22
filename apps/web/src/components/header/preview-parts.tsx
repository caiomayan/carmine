'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { HeaderView } from '@/lib/header-previews/view';
import { mapArt } from '@/lib/map-art';
import { cn } from '@/lib/utils';
import { usePreviewData } from './preview-data';

/**
 * Peças comuns dos painéis do header: o estado de carregando e de erro, a moldura de cada
 * painel (um bloco com título e atalho) e a imagem do mapa e dos Itens.
 */

/** O que o painel mostra enquanto não tem dados: esqueleto, ou o erro com "Tentar de novo". */
export function PanelState() {
  const t = useTranslations('headerPreviews');
  const { status, retry } = usePreviewData();
  if (status === 'error') {
    return (
      <div className="grid justify-items-start gap-3 p-2" data-testid="preview-error">
        <p className="flex items-center gap-2 text-body-sm">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-status-danger" />
          {t('error')}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={retry}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-3 p-2" data-testid="preview-loading" aria-busy="true">
      <span role="status" className="sr-only">
        {t('loading')}
      </span>
      <span className="shimmer h-24 rounded-lg" />
      <span className="shimmer h-4 w-2/3 rounded-sm" />
      <span className="shimmer h-4 w-1/2 rounded-sm" />
    </div>
  );
}

/** Dá ao painel só o que ele precisa da leitura, ou o estado de carregando/erro. */
export function WithView({ children }: { children: (view: HeaderView) => ReactNode }): ReactNode {
  const { view } = usePreviewData();
  return view ? children(view) : <PanelState />;
}

/** O título pequeno de um bloco do painel. */
export function BlockTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('label-caps text-muted-foreground', className)}>{children}</h3>;
}

/** Um destino do painel: linha clicável com fundo no hover (regra do dono: fundos, não anéis). */
export const rowLink =
  'group/row flex min-h-(--tap) items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover)';

/** O atalho do painel para a página dele, no rodapé. */
export function PanelFooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-(--tap) items-center rounded-lg px-2.5 text-body-sm font-medium text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover) hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/** A imagem do mapa (a mesma do cartão da home); sem imagem, o fundo neutro. */
export function MapThumb({ map, className }: { map: string | null; className?: string }) {
  const art = mapArt(map);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative block aspect-video overflow-hidden rounded-lg bg-surface-2',
        className,
      )}
    >
      {art ? (
        <picture>
          <source type="image/avif" srcSet={art.avif} sizes="208px" />
          <source type="image/webp" srcSet={art.webp} sizes="208px" />
          <img
            src={art.src}
            alt=""
            width={art.width}
            height={art.height}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </picture>
      ) : (
        <span className="map-neutral absolute inset-0" />
      )}
    </span>
  );
}

/** A imagem de um Item (CDN da cs2-lib), contida e sem fundo; sem imagem, o espaço vazio. */
export function ItemImage({ src, className }: { src: string | null; className?: string }) {
  if (!src) return <span aria-hidden="true" className={cn('block aspect-4/3', className)} />;
  return (
    // biome-ignore lint/performance/noImgElement: imagem da CDN da cs2-lib, sem otimização no Next (next.config).
    <img
      src={src}
      alt=""
      width={160}
      height={120}
      loading="lazy"
      decoding="async"
      className={cn('aspect-4/3 w-full object-contain', className)}
    />
  );
}
