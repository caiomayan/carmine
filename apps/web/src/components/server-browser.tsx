'use client';

import { useState } from 'react';
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from '@/components/animate-ui/components/radix/tabs';
import { EmptyState } from '@/components/empty-state';
import { ServerIcon } from '@/components/icons/animated/server';
import { PageHead } from '@/components/page-head';
import { SectionTitle } from '@/components/section-title';
import { ServerListColumns, ServerRowSkeleton } from '@/components/server-list';
import { MODE_FILTERS, type ModeFilter } from '@/lib/modes';
import { cn } from '@/lib/utils';

const GHOST_ROWS = ['ghost-1', 'ghost-2', 'ghost-3', 'ghost-4'];

export type ServerBrowserLabels = {
  title: string;
  subtitle: string;
  region: string;
  modeFilter: string;
  modes: Record<ModeFilter, string>;
  columns: { server: string; map: string; players: string; ping: string };
  empty: Record<ModeFilter, string>;
  emptyBody: string;
};

/**
 * Lista de Servidores Carmine por Modo. Os dados ao vivo chegam na S06; até lá cada aba mostra
 * a silhueta da lista com o estado vazio por cima.
 */
export function ServerBrowser({ labels }: { labels: ServerBrowserLabels }) {
  const [mode, setMode] = useState<ModeFilter>('all');

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as ModeFilter)} className="gap-0">
      <PageHead
        title={labels.title}
        subtitle={labels.subtitle}
        aside={
          <TabsList aria-label={labels.modeFilter} className="max-md:w-full">
            {MODE_FILTERS.map((m) => (
              <TabsTrigger key={m} value={m}>
                {labels.modes[m]}
              </TabsTrigger>
            ))}
          </TabsList>
        }
      />
      <section aria-labelledby="regiao-sao-paulo" className="pt-2">
        <SectionTitle id="regiao-sao-paulo">{labels.region}</SectionTitle>
        <ServerListColumns labels={labels.columns} />
        <TabsContents>
          {MODE_FILTERS.map((m) => (
            <TabsContent key={m} value={m} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
              <div className="grid">
                <div
                  aria-hidden="true"
                  className="[grid-area:1/1] mask-[linear-gradient(180deg,#000_0%,rgb(0_0_0/0.55)_45%,transparent_100%)]"
                >
                  {GHOST_ROWS.map((id, i) => (
                    <ServerRowSkeleton key={id} index={i} />
                  ))}
                </div>
                <EmptyState
                  icon={ServerIcon}
                  title={labels.empty[m]}
                  body={labels.emptyBody}
                  className={cn(
                    'relative isolate animate-fade-up self-center [grid-area:1/1] [animation-delay:180ms] max-md:mt-6 max-md:self-start',
                    // véu do próprio fundo atrás do texto: a silhueta da lista não disputa a leitura
                    'before:absolute before:-inset-x-20 before:-inset-y-4 before:-z-10 before:bg-[radial-gradient(closest-side,var(--bg)_62%,transparent)]',
                  )}
                />
              </div>
            </TabsContent>
          ))}
        </TabsContents>
      </section>
    </Tabs>
  );
}
