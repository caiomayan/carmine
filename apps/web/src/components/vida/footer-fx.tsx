'use client';

import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ACTIVITY_POOL, PEOPLE } from './data';
import { Face } from './face';
import { artUrl, pickVariant, useNight } from './map-art';

/* ------------------------------------------------------------------ mapa em destaque do rodapé */

let footerMap = 'mirage';
const listeners = new Set<() => void>();

/** A Home e o Perfil dizem ao rodapé qual é o mapa em destaque (a arte que aparece dentro das letras). */
export function setFooterMap(map: string) {
  if (map === footerMap) return;
  footerMap = map;
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const useFooterMap = () =>
  useSyncExternalStore(
    subscribe,
    () => footerMap,
    () => 'mirage',
  );

/* ------------------------------------------------------------------ revelação em cortina */

/**
 * Rodapé fixo atrás e conteúdo que sobe revelando-o no fim da página. Só no desktop e sem movimento reduzido;
 * no celular e com movimento reduzido o rodapé fica no fluxo normal. Mede o rodapé e grava `--footer-h` para
 * o conteúdo deixar essa folga embaixo.
 */
export function CurtainController() {
  useEffect(() => {
    // `?curtain=0` desliga a cortina (capturas de tela inteira; o rodapé fica no fluxo).
    if (new URLSearchParams(window.location.search).get('curtain') === '0') return;
    const query = window.matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
    const footer = document.querySelector<HTMLElement>('[data-site-footer]');
    let observer: ResizeObserver | null = null;
    const apply = () => {
      const root = document.documentElement;
      if (query.matches && footer) {
        root.dataset.curtain = 'on';
        root.style.setProperty('--footer-h', `${footer.offsetHeight}px`);
        observer ??= new ResizeObserver(() => root.style.setProperty('--footer-h', `${footer.offsetHeight}px`));
        observer.observe(footer);
      } else {
        delete root.dataset.curtain;
        root.style.removeProperty('--footer-h');
        observer?.disconnect();
        observer = null;
      }
    };
    apply();
    query.addEventListener('change', apply);
    return () => {
      query.removeEventListener('change', apply);
      observer?.disconnect();
      delete document.documentElement.dataset.curtain;
    };
  }, []);
  return null;
}

/* ------------------------------------------------------------------ wordmark gigante */

/**
 * "SAINT CARMINE" de ponta a ponta, em sinalização, com a arte do mapa em destaque aparecendo por dentro das
 * letras (background-clip: text) e um spotlight que segue o mouse dentro dele. O tamanho da fonte se ajusta
 * para o texto ocupar a largura toda.
 */
export function FooterWordmark() {
  const map = useFooterMap();
  const night = useNight();
  const variant = pickVariant(map, night);
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

  const art = variant ? `url(${artUrl(map, variant.id)})` : 'none';
  return (
    <div
      ref={wrap}
      data-testid="footer-wordmark"
      aria-hidden="true"
      className="v-wordmark"
      style={{ '--art': art } as React.CSSProperties}
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - box.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - box.top}px`);
      }}
    >
      <p ref={probe} className="v-sign v-wordmark-text">
        <span className="max-md:block">Saint</span> <span>Carmine</span>
      </p>
      <p className="v-sign v-wordmark-text v-wordmark-lit">
        <span className="max-md:block">Saint</span> <span>Carmine</span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ último evento do feed */

const text = (ev: (typeof ACTIVITY_POOL)[number]) => {
  const name = PEOPLE[ev.person]?.name ?? '';
  switch (ev.type) {
    case 'multi_kill':
      return { name, what: `fez ${ev.kills} abates`, where: ev.server };
    case 'skin_equipped':
      return { name, what: 'equipou uma skin', where: 'Loadout' };
    case 'joined':
      return { name, what: 'entrou no servidor', where: ev.server };
    case 'new_leader':
      return { name, what: 'assumiu a liderança', where: ev.mode === 'retake' ? 'Retake da semana' : 'Deathmatch da semana' };
  }
};

/** O último evento do feed, trocando a cada poucos segundos com uma animação de rolo (parado se `still`). */
export function LastEvent({ still = false }: { still?: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % ACTIVITY_POOL.length), 5200);
    return () => clearInterval(timer);
  }, [still]);
  const ev = ACTIVITY_POOL[index] ?? ACTIVITY_POOL[0];
  if (!ev) return null;
  const person = PEOPLE[ev.person];
  const t = text(ev);
  return (
    <div className="relative h-9 min-w-0 flex-1 overflow-hidden" data-testid="footer-last-event" aria-live="off">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={ev.id}
          initial={{ y: 22, opacity: 0, filter: 'blur(4px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -22, opacity: 0, filter: 'blur(4px)' }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="absolute inset-0 flex items-center gap-2.5"
        >
          {person ? <Face name={person.name} hue={person.hue} size={26} /> : null}
          <span className="truncate text-body-sm">
            <b className="font-semibold text-foreground">{t.name}</b>{' '}
            <span className="text-muted-foreground">
              {t.what} · {t.where}
            </span>
          </span>
        </m.div>
      </AnimatePresence>
    </div>
  );
}
