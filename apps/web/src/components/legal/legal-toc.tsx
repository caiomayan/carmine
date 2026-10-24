'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A lista do sumário das páginas legais: marca a seção que está na tela (`aria-current="location"`) conforme a
 * página rola, para a pessoa saber onde está num texto longo. Sem JavaScript é a lista de links de sempre.
 */
export function LegalToc({ headings }: { headings: readonly { id: string; text: string }[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);
    if (targets.length === 0) return;
    // A seção atual é a última cujo título já passou do terço de cima da janela.
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let current: string | null = null;
      for (const element of targets) {
        if (element.getBoundingClientRect().top <= line) current = element.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [headings]);

  return (
    <ol className="grid gap-px text-body-sm max-lg:grid-cols-2 max-md:grid-cols-1">
      {headings.map((heading) => (
        <li key={heading.id}>
          <a
            href={`#${heading.id}`}
            aria-current={active === heading.id ? 'location' : undefined}
            className={cn(
              '-mx-2 flex min-h-8 items-center rounded-lg px-2 py-1 text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground max-md:min-h-(--tap)',
              'aria-[current=location]:bg-(--fill-selected) aria-[current=location]:font-medium aria-[current=location]:text-foreground',
            )}
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ol>
  );
}
