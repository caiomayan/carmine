'use client';

import { PauseIcon, PlayIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Marquee } from '@/components/ui/marquee';
import type { ActivityItemView, ActivityView } from '@/lib/activity/view';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/** De quanto em quanto tempo o navegador pergunta de novo (a API guarda a resposta por 5 s). */
const POLL_MS = 15_000;

/** Com movimento reduzido a faixa é uma lista parada, que quebra linha: só os mais novos, para não empurrar a lista. */
const STATIC_SHOWN = 4;

const signature = (items: ActivityItemView[]) => items.map((item) => item.id).join();

/**
 * A faixa de atividade ao vivo da home (Marquee): o que acabou de acontecer nos Servidores Carmine,
 * logo acima da lista. Cada item é um link para o contexto (o servidor, o Ranking, o Perfil).
 * Corre quando não cabe, pausa no mouse, no foco e no botão; com movimento reduzido vira uma lista
 * parada. Sem acontecimentos (ou com a API fora) a faixa não existe, e quando aparece depois abre
 * devagar. É secundária: uma falha da leitura nunca vira aviso, a faixa só fica como estava.
 */
export function ActivityMarquee({ initial }: { initial: ActivityView | null }) {
  const t = useTranslations('activity');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', false);
  const [items, setItems] = useState(initial?.items ?? []);
  const [moving, setMoving] = useState(false);
  const [paused, setPaused] = useState(false);
  // Aberta desde o início se veio da leitura do servidor; se chegou depois, abre com transição.
  const [open, setOpen] = useState(items.length > 0);
  const [updated, setUpdated] = useState(false);
  const known = useRef(signature(items));

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
        if (signature(view.items) === known.current) return;
        known.current = signature(view.items);
        setUpdated(true);
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

  const hasItems = items.length > 0;
  useEffect(() => {
    if (!hasItems) {
      setOpen(false);
      return;
    }
    // Dois quadros: o primeiro desenha a faixa fechada, o segundo a abre.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setOpen(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [hasItems]);

  if (!hasItems) return null;

  const rows = (wrap: boolean) =>
    items.map((item) => <ActivityItem key={item.id} item={item} wrap={wrap} />);

  return (
    <section
      aria-label={t('label')}
      data-testid="activity-marquee"
      data-moving={moving && !reduced ? 'true' : 'false'}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-(--dur-slow) ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      <div className="flex min-h-0 items-center gap-1 overflow-hidden">
        {reduced ? (
          <ul aria-label={t('listLabel')} className="flex flex-wrap items-center gap-y-0.5">
            {rows(true).slice(0, STATIC_SHOWN)}
          </ul>
        ) : (
          <>
            {moving ? (
              <Button
                variant="quiet"
                size="icon"
                aria-label={paused ? t('resume') : t('pause')}
                data-testid="activity-pause"
                onClick={() => setPaused((value) => !value)}
              >
                {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
              </Button>
            ) : null}
            <Marquee
              key={updated ? signature(items) : 'initial'}
              label={t('listLabel')}
              paused={paused}
              onMovingChange={setMoving}
              className={cn('flex-1', updated && 'animate-fade-up')}
            >
              {rows(false)}
            </Marquee>
          </>
        )}
      </div>
    </section>
  );
}

/** Uma linha da faixa: a frase com o nome em destaque, num link para o contexto. */
function ActivityItem({ item, wrap }: { item: ActivityItemView; wrap: boolean }) {
  const t = useTranslations('activity');
  const rich = {
    b: (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>,
    player: item.player.name,
  };
  const text =
    item.kind === 'joined'
      ? t.rich('joined', { ...rich, server: item.server })
      : item.kind === 'multi_kill'
        ? t.rich('multiKill', { ...rich, server: item.server, kills: item.kills })
        : item.kind === 'new_leader'
          ? t.rich('newLeader', { ...rich, mode: t(`modes.${item.mode}`) })
          : t.rich('skinEquipped', { ...rich, skin: item.skin });

  return (
    <li
      data-testid="activity-item"
      data-kind={item.kind}
      className={cn('pr-1', wrap ? 'max-w-full' : 'shrink-0')}
    >
      <Link
        href={item.href}
        prefetch={false}
        className={cn(
          'inline-flex min-h-8 items-center rounded-md px-2.5 text-body-sm max-md:min-h-(--tap)',
          wrap ? 'py-1 [overflow-wrap:anywhere]' : 'whitespace-nowrap',
          'text-muted-foreground transition-colors duration-(--dur-fast) ease-std',
          'hover:bg-(--fill-hover) hover:text-foreground -outline-offset-2',
        )}
      >
        <span>{text}</span>
      </Link>
    </li>
  );
}
