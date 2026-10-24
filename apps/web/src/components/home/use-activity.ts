'use client';

import { useEffect, useRef, useState } from 'react';
import type { ActivityItemView, ActivityView } from '@/lib/activity/view';

/** De quanto em quanto tempo o navegador pergunta de novo (a API guarda a resposta por 5 s). */
const POLL_MS = 15_000;

const signature = (items: ActivityItemView[]) => items.map((item) => item.id).join();

/**
 * A atividade ao vivo da Home (a faixa do #71): começa com a leitura do servidor e pergunta a `/atividade/recentes`
 * a cada {@link POLL_MS} (e ao voltar para a aba). `fresh` são os acontecimentos que chegaram depois da primeira
 * leitura, para entrarem com animação. Falha de leitura nunca vira aviso: fica o que já havia.
 */
export function useActivity(initial: ActivityView | null): {
  items: ActivityItemView[];
  fresh: ReadonlySet<string>;
} {
  const [items, setItems] = useState(initial?.items ?? []);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const known = useRef(new Set(items.map((item) => item.id)));
  const last = useRef(signature(items));

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch('/atividade/recentes', {
          headers: { accept: 'application/json' },
        });
        if (!response.ok || stopped) return;
        const view = (await response.json()) as ActivityView;
        if (signature(view.items) === last.current) return;
        last.current = signature(view.items);
        const added = new Set(view.items.map((i) => i.id).filter((id) => !known.current.has(id)));
        for (const item of view.items) known.current.add(item.id);
        setFresh(added);
        setItems(view.items);
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

  return { items, fresh };
}
