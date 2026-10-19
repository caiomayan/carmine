import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MODES, type Mode } from '@/lib/modes';
import { rankingHref } from '@/lib/ranking';
import { cn } from '@/lib/utils';

/**
 * Abas por Modo do Ranking. São links (cada Modo tem o seu endereço compartilhável), então não
 * levam JavaScript: a aba ativa tem o fundo mais claro, como as demais abas, sem borda.
 */
export async function ModeTabs({ active, week }: { active: Mode; week: string | undefined }) {
  const t = await getTranslations('ranking');
  return (
    <nav aria-label={t('modeTabs')} className="max-md:w-full">
      <ul className="inline-flex gap-0.5 rounded-md max-md:flex max-md:w-full">
        {MODES.map((mode) => {
          const isActive = mode === active;
          return (
            <li key={mode} className="max-md:flex-1">
              <Link
                // O Modo troca e a semana fica: a mesma semana vale nos dois.
                href={rankingHref(mode, week) as '/ranking'}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`ranking-tab-${mode}`}
                className={cn(
                  'inline-flex min-h-(--tap) w-full items-center justify-center rounded-md px-3.5 text-sm font-[550] whitespace-nowrap',
                  'text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground focus-visible:outline-offset-0',
                  isActive && 'bg-hover text-foreground',
                )}
              >
                {t(`modes.${mode}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
