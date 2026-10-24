'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Só renderiza os filhos quando o bloco chega perto da tela (e, com `delayMs`, depois desse tempo). Serve para
 * o que é pesado e abaixo da dobra: o filho é um `dynamic()`, então o chunk dele só é baixado nesse momento, e
 * não na primeira carga. Sem `IntersectionObserver` mostra os filhos na hora.
 */
export function InView({
  children,
  fallback,
  rootMargin = '320px',
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [late, setLate] = useState(delayMs === 0);

  useEffect(() => {
    if (delayMs === 0) return;
    const timer = setTimeout(() => setLate(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      {seen && late ? children : fallback}
    </div>
  );
}
