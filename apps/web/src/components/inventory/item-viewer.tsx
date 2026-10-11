'use client';

import type { Cs2Item } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { HistoryIcon } from '@/components/icons/animated/history';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { imageForWear } from '@/lib/catalog/wear';
import type { AttachmentLabel } from '@/lib/inventory/item-form';
import { cn } from '@/lib/utils';
import { ViewerApi } from '@/lib/viewer/viewer-api.client';
import { buildViewerSrc, stringifyViewerItem, VIEWER_ORIGIN } from '@/lib/viewer/viewer-src';
import {
  hasWebGL,
  initialViewerState,
  VIEWER_READY_TIMEOUT_MS,
  VIEWER_RENDER_TIMEOUT_MS,
  viewerReducer,
} from '@/lib/viewer/viewer-state';

/** Arrastar o slider do float manda muitos Itens; o viewer recebe só o último de cada rajada. */
const SET_ITEM_DELAY_MS = 180;

/**
 * A prévia do Item no editor (S04, ADR 0006). O 2D (imagem da cs2-lib) chega já no HTML e
 * fica por baixo; o iframe do 3d.cstrike.app só aparece por cima quando confirma que desenhou.
 * Se ele não responder, recusar o Item ou atingir o limite, o 2D fica com uma explicação curta
 * e a opção de tentar de novo. Music kits e agentes são sempre 2D.
 */
export function ItemViewer({
  item,
  name,
  image,
  always2d,
  stickers,
  charm,
}: {
  item: Cs2Item;
  name: string;
  image: string;
  always2d: boolean;
  stickers: AttachmentLabel[];
  charm: AttachmentLabel | null;
}) {
  const t = useTranslations('itemEditor.viewer');
  const [state, dispatch] = useReducer(
    viewerReducer,
    { always2d, webgl: true },
    initialViewerState,
  );
  // Cada tentativa remonta o iframe com o Item da hora.
  const [attempt, setAttempt] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<ViewerApi | null>(null);
  const itemKey = stringifyViewerItem(item);
  const itemRef = useRef(item);
  itemRef.current = item;

  // WebGL só dá para saber no navegador. O iframe também só entra depois da hidratação: o
  // viewer mede o tamanho dele ao carregar, e assim não disputa a banda da primeira carga.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!always2d && !hasWebGL()) dispatch({ type: 'unsupported', reason: 'webgl' });
    setMounted(true);
  }, [always2d]);

  const in3d = state.mode === '3d';
  // biome-ignore lint/correctness/useExhaustiveDependencies: o src só muda numa nova tentativa; o Item segue por postMessage.
  const src = useMemo(() => buildViewerSrc(itemRef.current), [attempt]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!in3d || !mounted || !iframe) return;
    const api = new ViewerApi(iframe, { origin: VIEWER_ORIGIN });
    apiRef.current = api;
    const offs = [
      api.on('ready', () => dispatch({ type: 'ready' })),
      api.on('loading', ({ busy }) => dispatch({ type: 'loading', busy })),
      api.on('rendered', () => dispatch({ type: 'rendered' })),
      api.on('unsupported', ({ reason }) => dispatch({ type: 'unsupported', reason })),
      api.on('rateLimited', ({ retryAfterMs }) =>
        dispatch({ type: 'rateLimited', retryAfterMs, now: Date.now() }),
      ),
    ];
    return () => {
      for (const off of offs) off();
      api.destroy();
      apiRef.current = null;
    };
  }, [in3d, mounted]);

  const phase = state.mode === '3d' ? state.phase : null;
  useEffect(() => {
    if (phase !== 'connecting' && phase !== 'loading') return;
    const delay = phase === 'connecting' ? VIEWER_READY_TIMEOUT_MS : VIEWER_RENDER_TIMEOUT_MS;
    const timer = setTimeout(() => dispatch({ type: 'timeout' }), delay);
    return () => clearTimeout(timer);
  }, [phase]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: itemKey resume o Item; o objeto muda a cada render.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const timer = setTimeout(() => api.setItem(itemRef.current), SET_ITEM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [itemKey]);

  const ready = state.mode === '3d' && state.phase === 'ready';
  const reason = state.mode === '2d' && state.reason !== 'always' ? state.reason : null;
  const retryable = reason !== null && reason !== 'no-webgl';

  return (
    <figure
      aria-label={t('label', { name })}
      data-testid="item-viewer"
      data-mode={state.mode}
      data-phase={phase ?? undefined}
      className="relative isolate grid overflow-hidden rounded-xl bg-surface [background-image:repeating-linear-gradient(135deg,transparent_0_11px,color-mix(in_srgb,var(--text)_3.5%,transparent)_11px_12px)]"
    >
      <div className="grid aspect-4/3 place-items-center [grid-area:1/1] max-lg:aspect-16/10">
        <div
          className={cn(
            'grid w-[78%] justify-items-center gap-4 transition-opacity duration-(--dur-slow) ease-std',
            ready && 'opacity-0',
          )}
          data-testid="viewer-2d"
        >
          {/* biome-ignore lint/performance/noImgElement: imagens da CDN da cs2-lib, sem otimização no Next. */}
          <img
            src={imageForWear(image, item.wear ?? null)}
            alt=""
            width={512}
            height={384}
            fetchPriority="high"
            className="aspect-4/3 w-full object-contain drop-shadow-[0_18px_22px_rgb(0_0_0/0.35)]"
          />
          {stickers.length > 0 || charm ? (
            <ul
              className="flex flex-wrap justify-center gap-1.5"
              data-testid="viewer-2d-attachments"
            >
              {[...stickers, ...(charm ? [charm] : [])].map((attachment, index) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: o mesmo sticker pode estar em dois slots.
                  key={`${attachment.id}-${index}`}
                  className="grid size-11 place-items-center rounded-md bg-surface-2/80"
                  title={attachment.name}
                >
                  {attachment.image ? (
                    // biome-ignore lint/performance/noImgElement: CDN da cs2-lib.
                    <img
                      src={attachment.image}
                      alt={attachment.name}
                      width={40}
                      height={30}
                      className="w-9 object-contain"
                    />
                  ) : (
                    <span className="sr-only">{attachment.name}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {in3d && mounted ? (
        <iframe
          key={attempt}
          ref={iframeRef}
          src={src}
          title={t('frame', { name })}
          referrerPolicy="origin"
          data-testid="viewer-iframe"
          className={cn(
            // color-scheme igual ao do documento do viewer: sem isso o navegador pinta um fundo
            // opaco atrás do canvas transparente no tema escuro.
            'absolute inset-0 size-full border-0 [color-scheme:light] transition-opacity duration-(--dur-slow) ease-std',
            ready ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        />
      ) : null}

      <figcaption className="pointer-events-none relative z-10 flex items-end justify-between gap-3 px-4 pb-3 [grid-area:1/1] self-end text-[11.5px] text-muted-foreground">
        {in3d && !ready ? (
          <span role="status" className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="shimmer h-1 w-10 rounded-full" />
            {t('loading')}
          </span>
        ) : ready ? (
          <span>{t('hint')}</span>
        ) : (
          <span />
        )}
      </figcaption>

      {reason ? (
        <div
          role="status"
          data-testid="viewer-fallback"
          data-reason={reason}
          data-icon-trigger
          className="absolute top-3 left-3 right-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-background/85 px-3 py-2 text-[12.5px] animate-fade-up"
        >
          <AnimatedIcon icon={HistoryIcon} size={14} className="text-status-info" />
          <span className="min-w-0 flex-1">{t(`reasons.${reason}`)}</span>
          {retryable ? (
            <Button
              variant="quiet"
              size="sm"
              className="-my-1 min-h-7"
              onClick={() => {
                setAttempt((n) => n + 1);
                dispatch({ type: 'retry' });
              }}
            >
              {t('retry')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
