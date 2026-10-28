'use client';

import { AnimatePresence, m, useIsPresent } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityText } from '@/components/home/activity-text';
import { type ArtPair, artUrl } from '@/components/vida/map-art';
import { useArtChoice } from '@/components/vida/map-picture';
import type { ActivityItemView, ActivityView } from '@/lib/activity/view';
import './footer.css';

/* ------------------------------------------------------------------ revelação em cortina */

/**
 * Rodapé fixo atrás e conteúdo que sobe revelando-o no fim da página (a cortina). Só no desktop
 * (1024 px ou mais), sem movimento reduzido e com o rodapé até 85 % da altura da janela; em janela baixa
 * (notebook) o CSS encolhe os respiros do rodapé para ele caber (`footer.css`). No celular, com
 * movimento reduzido e onde ainda assim não cabe, o rodapé fica no fluxo normal (no desktop, subindo ao entrar). Mede o rodapé e grava `--footer-h` para o
 * conteúdo deixar essa folga embaixo. `?curtain=0` desliga a cortina (capturas de tela inteira).
 */
export function CurtainController() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('curtain') === '0') return;
    const query = window.matchMedia(
      '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
    );
    const footer = document.querySelector<HTMLElement>('[data-site-footer]');
    if (!footer) return;
    const root = document.documentElement;
    const off = () => {
      delete root.dataset.curtain;
      root.style.removeProperty('--footer-h');
    };
    const apply = () => {
      const height = footer.offsetHeight;
      // Um rodapé que não cabe na tela não pode ficar fixo (cortaria o que sobra): fica no fluxo.
      if (query.matches && height <= window.innerHeight * 0.85) {
        root.dataset.curtain = 'on';
        root.style.setProperty('--footer-h', `${height}px`);
      } else {
        off();
      }
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(footer);
    window.addEventListener('resize', apply);
    query.addEventListener('change', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      query.removeEventListener('change', apply);
      off();
    };
  }, []);
  return null;
}

/* ------------------------------------------------------------------ wordmark gigante */

/**
 * "SAINT CARMINE" de ponta a ponta, em sinalização, com a arte do mapa em destaque (o do servidor
 * mais cheio agora) aparecendo por dentro das letras (`background-clip: text`) e um spotlight que
 * segue o mouse. O tamanho da fonte se ajusta para o texto ocupar a largura toda. Decorativo: a
 * marca de verdade é o link do topo do rodapé.
 */
export function FooterWordmark({ map, art }: { map: string; art: ArtPair | null }) {
  const choice = useArtChoice(art);
  const wrap = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const node = wrap.current;
    const text = probe.current;
    if (!node || !text) return;
    const fit = () => {
      text.style.fontSize = '100px';
      const width = text.scrollWidth;
      text.style.fontSize = '';
      if (width > 0) node.style.setProperty('--fs', `${(100 * node.clientWidth) / width}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, []);

  const image = choice ? `url(${artUrl(map, choice.id)})` : 'none';
  return (
    <div
      ref={wrap}
      data-testid="footer-wordmark"
      data-map={map}
      aria-hidden="true"
      className="ft-wordmark"
      style={{ '--art': image } as CSSProperties}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`);
        event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`);
      }}
    >
      <p ref={probe} className="v-sign ft-wordmark-text">
        <span className="max-md:block">Saint</span> <span>Carmine</span>
      </p>
      <p className="v-sign ft-wordmark-text ft-wordmark-lit">
        <span className="max-md:block">Saint</span> <span>Carmine</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ último acontecimento */

/** De quanto em quanto tempo o navegador pergunta de novo (a API guarda a resposta por 5 s). */
const POLL_MS = 15_000;

/**
 * O último acontecimento nos Servidores Carmine (o primeiro do feed da API, o mesmo da faixa da
 * home), no rodapé. Lido no servidor e relido a cada 15 s com a aba à vista; quando chega um novo,
 * troca com um rolo. Sem acontecimentos (ou com a API fora) não aparece: nunca vira aviso.
 */
export function FooterLastEvent({ initial }: { initial: ActivityView | null }) {
  const t = useTranslations('shell.footer.last');
  const [latest, setLatest] = useState<ActivityItemView | null>(initial?.items[0] ?? null);
  const known = useRef(latest?.id ?? null);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch('/atividade/recentes', {
          headers: { accept: 'application/json' },
        });
        if (!response.ok || stopped) return;
        const first = ((await response.json()) as ActivityView).items[0] ?? null;
        if ((first?.id ?? null) === known.current) return;
        known.current = first?.id ?? null;
        setLatest(first);
      } catch {
        // Fica como estava: a próxima volta tenta de novo.
      }
    };
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!latest) return null;
  return (
    <div
      data-testid="footer-last-event"
      className="relative flex h-14 min-w-0 flex-1 items-center overflow-hidden rounded-lg bg-surface px-4.5 text-body-sm max-md:h-auto max-md:min-h-14 max-md:py-3"
    >
      <span className="sr-only">{t('label')}: </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <EventRoll key={latest.id} item={latest} />
      </AnimatePresence>
    </div>
  );
}

/**
 * Um acontecimento no rolo. Enquanto o antigo sai (a animação de saída dura uns quadros) ele e o novo
 * existem juntos: o que sai fica `aria-hidden` e `inert`, para o leitor de tela, o Tab e quem procura
 * por link verem um só acontecimento de cada vez.
 */
function EventRoll({ item }: { item: ActivityItemView }) {
  const present = useIsPresent();
  return (
    <m.div
      initial={{ y: 20, opacity: 0, filter: 'blur(4px)' }}
      animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
      exit={{ y: -20, opacity: 0, filter: 'blur(4px)' }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      aria-hidden={present ? undefined : true}
      inert={!present}
      className="min-w-0 flex-1"
    >
      <Link
        href={item.href}
        prefetch={false}
        className="block min-w-0 truncate rounded-xs text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:text-foreground max-md:whitespace-normal"
      >
        <ActivityText item={item} />
      </Link>
    </m.div>
  );
}
