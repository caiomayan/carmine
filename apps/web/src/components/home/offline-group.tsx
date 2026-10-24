'use client';

import type { LiveServer } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ServerCard } from './server-card';

/**
 * Os servidores offline, no fim da lista, em cartões compactos (sem arte, sem botão de jogar, com o motivo por
 * extenso). Com poucos o grupo já nasce aberto; com muitos (resíduo de teste, manutenção) fica recolhido atrás de
 * "Offline (n)". Só a escolha da pessoa fica guardada: sem ela, o padrão acompanha a lista ao vivo.
 */
export function OfflineGroup({
  servers,
  defaultOpen,
  startIndex,
}: {
  servers: LiveServer[];
  defaultOpen: boolean;
  startIndex: number;
}) {
  const t = useTranslations('servers.offline');
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? defaultOpen;
  const listId = useId();
  if (servers.length === 0) return null;

  return (
    <div data-testid="offline-group" className="pt-6">
      <Button
        variant="quiet"
        size="sm"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setChosen(!open)}
        className="px-3.5"
      >
        <span className="tabular-nums">{t('title', { count: servers.length })}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={cn(
            'size-3.5 transition-transform duration-(--dur-slow) ease-soft motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </Button>
      {/* abre e fecha deslizando: a linha do grid vai de 0fr a 1fr; fechado, o conteúdo sai da árvore de
          acessibilidade (visibility) só depois de a transição acabar */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity,visibility] duration-(--dur-slow) ease-soft motion-reduce:transition-none',
          open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ul
            id={listId}
            aria-label={t('listLabel')}
            className="grid gap-4 pt-3 min-[760px]:grid-cols-2"
          >
            {servers.map((server, i) => (
              <ServerCard
                key={server.id}
                server={server}
                art={undefined}
                index={startIndex + i}
                friends={[]}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
