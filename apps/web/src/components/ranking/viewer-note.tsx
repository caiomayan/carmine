import type { Ranking } from '@carmine/contracts';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { siSteam } from 'simple-icons';
import { BrandIcon } from '@/components/icons/brand-icon';
import { Button } from '@/components/ui/button';
import { steamLoginHref } from '@/lib/auth-links';
import { rankingHref } from '@/lib/ranking';
import { DISCORD_URL } from '@/lib/social';

/** O link do Discord dentro de uma frase. */
export const discordLink = (chunks: ReactNode) => (
  <a
    href={DISCORD_URL}
    target="_blank"
    rel="noopener noreferrer"
    className="font-semibold underline decoration-line-strong underline-offset-(--underline-offset) hover:decoration-foreground"
  >
    {chunks}
  </a>
);

/**
 * O que o Ranking diz a quem está vendo: a própria posição (mesmo fora do top 50), quanto falta
 * para o mínimo da semana, o aviso de remoção pela Staff (com a orientação de contestar pelo
 * Discord) ou, sem sessão, o convite para entrar. Uma linha curta, no fundo de superfície.
 */
export async function ViewerNote({ ranking }: { ranking: Ranking }) {
  const t = await getTranslations('ranking');
  const format = await getFormatter();
  const { viewer } = ranking;
  const mode = t(`modes.${ranking.mode}`);

  let message: ReactNode;
  let progress: number | null = null;
  if (viewer === null) {
    return (
      <aside
        data-testid="viewer-note"
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl bg-surface px-5 py-4"
      >
        <p className="text-body-sm text-muted-foreground">{t('viewer.signIn')}</p>
        <Button asChild size="sm" className="max-md:w-full">
          <a href={steamLoginHref(rankingHref(ranking.mode, ranking.weekStart, ranking.weeks[0]))}>
            <BrandIcon icon={siSteam} size={15} />
            {t('viewer.signInAction')}
          </a>
        </Button>
      </aside>
    );
  }
  if (viewer.entry) {
    message = t(ranking.current ? 'viewer.ranked' : 'viewer.rankedPast', {
      position: format.number(viewer.entry.position),
      mode,
    });
  } else if (viewer.removed) {
    message = t.rich('viewer.removed', { mode, discord: discordLink });
  } else if (viewer.progress) {
    message = ranking.current
      ? t(viewer.progress.unit === 'rounds' ? 'viewer.progressRounds' : 'viewer.progressMinutes', {
          missing: viewer.progress.missing,
        })
      : t('viewer.progressPast');
    progress = ranking.current
      ? (ranking.minimum.value - viewer.progress.missing) / ranking.minimum.value
      : null;
  } else {
    return null;
  }

  return (
    <aside
      data-testid="viewer-note"
      aria-label={t('viewer.title')}
      className="grid gap-3 rounded-xl bg-surface px-5 py-4"
    >
      <p className="text-body-sm [text-wrap:pretty]" aria-live="polite">
        {message}
      </p>
      {progress !== null ? (
        <div
          aria-hidden="true"
          className="h-1 max-w-[320px] overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full origin-left rounded-full bg-foreground transition-transform duration-(--dur-slow) ease-std"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }}
          />
        </div>
      ) : null}
    </aside>
  );
}
