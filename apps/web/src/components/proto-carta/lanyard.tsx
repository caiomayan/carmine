'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * O cartão pendurado no cordão, com física (three.js). O three só é carregado aqui, por `import()`, quando a vitrine
 * abre: nenhuma outra página do site baixa a biblioteca. Sem WebGL, ou com `prefers-reduced-motion`, o cartão aparece
 * parado como imagem (a mesma imagem compartilhável): a informação é a mesma, só falta a física.
 */
export function Lanyard({ imageUrl, label }: { imageUrl: string; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'loading' | 'live' | 'static'>('loading');

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMode('static');
      return;
    }
    setMode('loading');
    let disposed = false;
    let teardown: (() => void) | undefined;
    void (async () => {
      try {
        const { mountLanyard } = await import('./lanyard-scene');
        if (disposed) return;
        // As fontes do cordão e do verso precisam estar prontas antes de desenhar o texto nas texturas.
        await document.fonts.ready;
        if (disposed) return;
        teardown = mountLanyard(element, imageUrl, () => {
          if (!disposed) setMode('live');
        });
      } catch {
        if (!disposed) setMode('static');
      }
    })();
    return () => {
      disposed = true;
      teardown?.();
    };
  }, [imageUrl]);

  return (
    <div className="lc-stage" data-mode={mode} data-testid="lanyard">
      <div ref={host} className="lc-canvas" />
      {mode === 'static' ? (
        // biome-ignore lint/performance/noImgElement: a imagem gerada na hora pela rota, tamanho variável
        <img src={imageUrl} alt={label} className="lc-static" width={540} height={675} />
      ) : null}
      {mode === 'live' ? (
        <p className="lc-hint">Pegue o cartão e jogue de um lado para o outro</p>
      ) : null}
      {mode === 'loading' ? (
        <p className="lc-hint" role="status">
          Pendurando o cartão…
        </p>
      ) : null}
    </div>
  );
}
