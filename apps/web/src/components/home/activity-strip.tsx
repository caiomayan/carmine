'use client';

import { PauseIcon, PlayIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Marquee } from '@/components/ui/marquee';
import type { ActivityItemView } from '@/lib/activity/view';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { ActivityText } from './activity-text';
import { PlayerAvatar } from './player-avatar';

/** Com movimento reduzido a faixa é uma lista parada, que quebra linha: só os mais novos, para não empurrar a Home. */
const STATIC_SHOWN = 4;

const signature = (items: ActivityItemView[]) => items.map((item) => item.id).join();

/**
 * O Marquee da atividade: onde não há trilho (abaixo de 1280 px), os acontecimentos dos servidores (#71) correm numa
 * faixa de uma linha, logo abaixo do hero. Cada item é uma pílula com o avatar e a frase, e leva ao contexto. Corre
 * só quando não cabe; pausa no mouse, no foco e no botão (WCAG 2.2.2); com movimento reduzido vira uma lista parada.
 * O leitor de tela lê cada item uma vez (a cópia do trilho é `aria-hidden` e `inert`). Sem acontecimentos, a faixa
 * não existe; quando aparece depois, abre devagar.
 */
export function ActivityStrip({
  items,
  className,
}: {
  items: ActivityItemView[];
  className?: string;
}) {
  const t = useTranslations('activity');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', false);
  const [moving, setMoving] = useState(false);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(items.length > 0);
  const [updated, setUpdated] = useState(false);
  const [seen, setSeen] = useState(() => signature(items));

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

  // Uma atualização (não a primeira leitura) refaz o trilho do começo, com um fade.
  const current = signature(items);
  useEffect(() => {
    if (current === seen) return;
    setSeen(current);
    setUpdated(true);
  }, [current, seen]);

  if (!hasItems) return null;

  const rows = (wrap: boolean) =>
    items.map((item) => <StripItem key={item.id} item={item} wrap={wrap} />);

  return (
    <section
      aria-label={t('label')}
      data-testid="activity-strip"
      data-moving={moving && !reduced ? 'true' : 'false'}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-(--dur-slow) ease-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className,
      )}
    >
      <div className="flex min-h-0 items-center gap-1 overflow-hidden">
        {reduced ? (
          <ul aria-label={t('listLabel')} className="flex flex-wrap items-center gap-y-1.5">
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
              key={updated ? current : 'initial'}
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

/** Uma pílula da faixa: avatar e frase num link para o contexto. */
function StripItem({ item, wrap }: { item: ActivityItemView; wrap: boolean }) {
  return (
    <li
      data-testid="activity-item"
      data-kind={item.kind}
      className={cn('py-0.5 pr-2.5', wrap ? 'max-w-full' : 'shrink-0')}
    >
      <Link
        href={item.href}
        prefetch={false}
        className={cn(
          'vh-pillrow max-w-full text-body-sm text-muted-foreground -outline-offset-2 max-md:min-h-(--tap)',
          wrap ? '[overflow-wrap:anywhere]' : 'whitespace-nowrap',
        )}
      >
        <PlayerAvatar src={item.player.avatarUrl} name={item.player.name} size={28} />
        <span>
          <ActivityText item={item} />
        </span>
      </Link>
    </li>
  );
}
