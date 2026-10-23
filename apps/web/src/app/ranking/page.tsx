import { DEATHMATCH_MIN_MINUTES, RETAKE_MIN_ROUNDS } from '@carmine/contracts';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { BadgeAlertIcon } from '@/components/icons/animated/badge-alert';
import { UsersIcon } from '@/components/icons/animated/users';
import { PageHead } from '@/components/page-head';
import { ModeTabs } from '@/components/ranking/mode-tabs';
import { RankingTable } from '@/components/ranking/ranking-table';
import { discordLink, ViewerNote } from '@/components/ranking/viewer-note';
import { WeekSelect } from '@/components/ranking/week-select';
import { WeekTitle } from '@/components/ranking/week-title';
import { Button } from '@/components/ui/button';
import { getRanking } from '@/lib/api-server';
import { parseRankingQuery, rankingHref } from '@/lib/ranking';

type SearchParams = Promise<Record<'modo' | 'semana', string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ranking');
  return { title: t('title'), description: t('metaDescription') };
}

/**
 * O Ranking semanal (S12): um Modo por aba, a semana no endereço (compartilhável) e, para quem
 * está logado, a própria posição ou quanto falta para o mínimo.
 */
export default async function RankingPage({ searchParams }: { searchParams: SearchParams }) {
  const { mode, week } = parseRankingQuery(await searchParams);
  const t = await getTranslations('ranking');
  const format = await getFormatter();
  const result = await getRanking(mode, week);

  const head = <PageHead title={t('title')} subtitle={t('subtitle')} />;

  if (result.status !== 'ok') {
    const invalid = result.status === 'invalid-week';
    return (
      <div className="container-page animate-fade-up pb-16">
        {head}
        <div className="grid gap-5">
          <ModeTabs active={mode} week={undefined} />
          <div className="rounded-xl bg-surface">
            <EmptyState
              icon={BadgeAlertIcon}
              title={invalid ? t('invalidWeek.title') : t('unavailable.title')}
              body={invalid ? t('invalidWeek.body') : t('unavailable.body')}
              action={
                invalid ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={rankingHref(mode) as Route}>{t('invalidWeek.action')}</Link>
                  </Button>
                ) : null
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const { ranking } = result;
  const currentWeek = ranking.weeks[0] ?? ranking.weekStart;
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const rangeOf = (start: string) => {
    const end = new Date(Date.parse(`${start}T00:00:00Z`) + 6 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return { start: day(start), end: day(end) };
  };
  // A semana pedida entra na lista mesmo que a API não a liste (uma semana antiga compartilhada).
  const weeks = ranking.weeks.includes(ranking.weekStart)
    ? ranking.weeks
    : [...ranking.weeks, ranking.weekStart].sort().reverse();
  const options = weeks.map((start) => ({
    value: start,
    label: t(start === currentWeek ? 'week.current' : 'week.past', rangeOf(start)),
    href: rankingHref(mode, start, currentWeek),
  }));
  const minimum = mode === 'retake' ? RETAKE_MIN_ROUNDS : DEATHMATCH_MIN_MINUTES;

  return (
    <div className="container-page pb-16">
      {head}

      <div className="grid animate-fade-up gap-5 [animation-delay:40ms]">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <ModeTabs active={mode} week={ranking.current ? undefined : ranking.weekStart} />
          <WeekSelect label={t('week.label')} value={ranking.weekStart} options={options} />
        </div>

        <WeekTitle
          currentWeek={currentWeek}
          text={t(
            ranking.current ? 'week.titleCurrent' : 'week.titlePast',
            rangeOf(ranking.weekStart),
          )}
        />

        <p className="max-w-[68ch] text-body-sm text-muted-foreground [text-wrap:pretty]">
          {t(`rules.${mode}`, { min: minimum })}
        </p>

        <ViewerNote ranking={ranking} />

        {ranking.entries.length > 0 ? (
          <RankingTable ranking={ranking} />
        ) : (
          <div className="rounded-xl bg-surface" data-testid="ranking-empty">
            <EmptyState
              icon={UsersIcon}
              title={t(ranking.current ? 'empty.title' : 'empty.titlePast')}
              body={
                ranking.current
                  ? t(mode === 'retake' ? 'empty.bodyRetake' : 'empty.bodyDeathmatch', {
                      min: minimum,
                    })
                  : t('empty.bodyPast', {
                      min: minimum,
                      unit: t(`units.${ranking.minimum.unit}`),
                    })
              }
            />
          </div>
        )}

        <p className="max-w-[68ch] text-body-sm text-muted-foreground [text-wrap:pretty]">
          {t.rich('integrity', { discord: discordLink })}
        </p>
      </div>
    </div>
  );
}
