'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Só renderiza os filhos quando o bloco chega perto da tela. Serve ao que é pesado e fica abaixo da dobra: o
 * filho é um `dynamic()`, então o chunk dele só é baixado nesse momento, e não na primeira carga (orçamento de JS).
 * Sem `IntersectionObserver`, mostra os filhos na hora.
 */
export function InView({
  children,
  fallback,
  rootMargin = '320px',
  className,
  testId,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

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
    <div ref={ref} className={className} data-testid={testId}>
      {seen ? children : fallback}
    </div>
  );
}
