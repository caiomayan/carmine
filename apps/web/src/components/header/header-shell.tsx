'use client';

import { type ReactNode, useEffect, useRef } from 'react';

/** Folga entre o topo da janela e a pílula do header rolado; o mesmo valor de `top` em `vida.css`. */
const PILL_TOP = 8;

/**
 * O header fica fixo no topo a partir de 768 px (no celular rola junto com a página: o header de
 * duas linhas tomaria a tela). Em repouso (scrollY = 0) é só o fundo da página, sem linha; ao rolar
 * vira uma pílula de vidro flutuante (o estilo está em `vida.css`, em
 * `[data-site-header][data-scrolled]`, com transição suave e sem ela com movimento reduzido).
 * Também avisa a altura dele em `--site-hdr-h` (0 no celular, onde ele não é fixo), para o que gruda
 * logo abaixo (a barra do Loadout, o sumário das páginas legais) e o `scroll-padding-top` saberem
 * onde começa a tela útil.
 */
export function HeaderShell({ children, className }: { children: ReactNode; className?: string }) {
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const root = document.documentElement;
    const onScroll = () => element.toggleAttribute('data-scrolled', window.scrollY > 0);
    const measure = () => {
      const fixed = getComputedStyle(element).position === 'sticky';
      // Rolada, a pílula (vida.css) desce PILL_TOP do topo: a pegada de cima continua a mesma de antes de rolar.
      const lift = fixed && element.hasAttribute('data-scrolled') ? PILL_TOP : 0;
      root.style.setProperty('--site-hdr-h', fixed ? `${element.offsetHeight + lift}px` : '0px');
    };
    onScroll();
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--site-hdr-h');
    };
  }, []);

  return (
    <header ref={header} data-site-header className={className}>
      {children}
    </header>
  );
}
