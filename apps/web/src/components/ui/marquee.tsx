'use client';

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Velocidade do trilho, em px por segundo: devagar o bastante para ler o que passa. */
const SPEED = 36;

/** As pontas somem em vez de cortar o texto. */
const EDGE_FADE =
  '[mask-image:linear-gradient(to_right,transparent,#000_1.5rem,#000_calc(100%_-_1.5rem),transparent)]';

/**
 * Uma faixa que corre sem parar quando o conteúdo não cabe (o marquee do Magic UI, só com CSS):
 * duas cópias lado a lado andam uma cópia por volta, então a emenda não aparece. O que cabe fica
 * parado, sem cópia. A cópia que se repete é `aria-hidden` e `inert` (o leitor de tela e o Tab
 * passam só pela lista de verdade). O mouse e o foco do teclado pausam; com o foco o trilho para e
 * volta ao começo, para o navegador levar o item focado à vista. `paused` é a pausa de quem usa
 * (WCAG 2.2.2). Quem decide ficar sem movimento (prefers-reduced-motion) nem monta isto. Fora da tela (rolou para
 * longe) e com a aba oculta o trilho fica pausado: nada corre sem ninguém ver.
 *
 * O `children` são os `<li>` da lista; cada um leva o seu espaço à direita, e é isso que faz a
 * cópia emendar no ritmo certo.
 */
export function Marquee({
  label,
  children,
  paused = false,
  onMovingChange,
  className,
}: {
  /** O nome da lista para o leitor de tela. */
  label: string;
  children: ReactNode;
  paused?: boolean;
  /** Avisa quando a faixa passa a correr (ou a parar por caber), para mostrar a pausa só então. */
  onMovingChange?: (moving: boolean) => void;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(0);
  const [moving, setMoving] = useState(false);
  const [focused, setFocused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);

  // Pausa fora da tela (IntersectionObserver) e com a aba oculta.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry?.isIntersecting ?? true),
    );
    observer.observe(node);
    const onVisibility = () => setTabVisible(!document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const measure = () => {
      if (!frame.current || !copy.current) return;
      const content = copy.current.offsetWidth;
      setWidth(content);
      setMoving(content > frame.current.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (frame.current) observer.observe(frame.current);
    if (copy.current) observer.observe(copy.current);
    return () => observer.disconnect();
  }, []);

  // O foco entra e sai por dentro da faixa: o trilho para e, ao sair, volta ao começo (o navegador
  // pode ter rolado a faixa para mostrar o item focado).
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const enter = () => setFocused(true);
    const leave = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
      setFocused(false);
      node.scrollLeft = 0;
    };
    node.addEventListener('focusin', enter);
    node.addEventListener('focusout', leave);
    return () => {
      node.removeEventListener('focusin', enter);
      node.removeEventListener('focusout', leave);
    };
  }, []);

  useEffect(() => {
    onMovingChange?.(moving);
  }, [moving, onMovingChange]);

  return (
    <div
      ref={frame}
      className={cn('group min-w-0 overflow-hidden', moving && EDGE_FADE, className)}
    >
      <div
        data-slot="marquee-track"
        className={cn(
          'flex w-max',
          moving &&
            !focused &&
            'animate-marquee group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]',
        )}
        style={
          {
            '--marquee-duration': `${Math.max(width / SPEED, 1)}s`,
            ...((paused || !onScreen || !tabVisible) && { animationPlayState: 'paused' }),
          } as CSSProperties
        }
      >
        <ul ref={copy} aria-label={label} className="flex shrink-0 items-center">
          {children}
        </ul>
        {moving ? (
          <ul aria-hidden="true" inert className="flex shrink-0 items-center">
            {children}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
