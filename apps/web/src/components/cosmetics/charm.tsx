'use client';

import { animate, m, useMotionValue, useReducedMotion } from 'framer-motion';
import { type RefObject, useEffect } from 'react';
import type { CharmPick } from './catalog';

/** Onde o chaveiro se prende na borda do avatar: 52° abaixo da horizontal, à direita. */
const PIVOT_ANGLE = (52 * Math.PI) / 180;

/**
 * O chaveiro do Inventário pendurado na borda do avatar por uma correntinha. Ao passar o mouse (no
 * avatar ou na linha marcada com `data-cos-host`) ele balança com física de mola: a mola leva o
 * ângulo de volta a zero com um impulso inicial e o amortecimento deixa as oscilações morrerem.
 * VIP: mola mais solta (balança mais vezes), brilho dourado e um brilhinho que pisca. Movimento
 * reduzido: o chaveiro fica parado, sem balanço e sem brilhinho.
 */
export function Charm({
  pick,
  rich,
  idle,
  hostRef,
}: {
  pick: CharmPick;
  rich: boolean;
  /** Balança sozinho devagar (no Perfil). */
  idle: boolean;
  /** O elemento que escuta o ponteiro: o próprio avatar ou a linha da lista. */
  hostRef: RefObject<HTMLElement | null>;
}) {
  const reduced = useReducedMotion() ?? false;
  const angle = useMotionValue(0);
  // Tudo em % da caixa do avatar: o chaveiro acompanha o avatar quando ele muda de tamanho (celular).
  const width = 48;
  const left = Math.round((50 + 50 * Math.cos(PIVOT_ANGLE) - width / 2) * 100) / 100;
  const top = Math.round((50 + 50 * Math.sin(PIVOT_ANGLE)) * 100) / 100;

  useEffect(() => {
    const avatar = hostRef.current;
    if (!avatar || reduced) return;
    const host = avatar.closest<HTMLElement>('[data-cos-host]') ?? avatar;
    let last = 0;
    const swing = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const now = performance.now();
      if (now - last < 250) return;
      last = now;
      // Um impulso para o lado de onde o ponteiro veio; a mola faz o resto.
      const rect = avatar.getBoundingClientRect();
      const from = event.clientX < rect.left + rect.width / 2 ? 1 : -1;
      animate(angle, 0, {
        type: 'spring',
        stiffness: rich ? 70 : 120,
        damping: rich ? 2.6 : 5.5,
        mass: 1,
        velocity: from * (rich ? 520 : 380),
      });
    };
    host.addEventListener('pointerenter', swing);
    return () => host.removeEventListener('pointerenter', swing);
  }, [angle, hostRef, reduced, rich]);

  return (
    <m.span
      aria-hidden="true"
      className="cos-charm"
      data-rich={rich || undefined}
      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, rotate: angle }}
    >
      {/* O balanço lento e o brilhinho vêm do CSS (movimento reduzido os desliga lá): o HTML do servidor e o do cliente são iguais. */}
      <span className={idle ? 'cos-idle relative block' : 'relative block'}>
        <svg
          viewBox="0 0 10 14"
          aria-hidden="true"
          className="mx-auto block"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          style={{
            width: '32%',
            color: rich ? 'var(--status-vip)' : 'var(--muted-foreground, #9a9a9a)',
          }}
        >
          <ellipse cx="5" cy="3.6" rx="2.4" ry="3.4" />
          <ellipse cx="5" cy="10.2" rx="2.4" ry="3.4" />
        </svg>
        {/* biome-ignore lint/performance/noImgElement: imagem do catálogo, pequena e externa. */}
        <img src={pick.image} alt="" loading="lazy" decoding="async" />
        {rich ? (
          <>
            <i className="cos-spark" style={{ left: '18%', top: '42%' }} />
            <i
              className="cos-spark"
              style={{ left: '66%', top: '72%', animationDelay: '1.1s', width: 4, height: 4 }}
            />
          </>
        ) : null}
      </span>
    </m.span>
  );
}
