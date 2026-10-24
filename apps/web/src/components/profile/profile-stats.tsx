import type { GameMode, ProfileSeries, ProfileStats as ProfileStatsData } from '@carmine/contracts';
import { getFormatter, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { LockIcon } from '@/components/icons/animated/lock';
import { UsersIcon } from '@/components/icons/animated/users';
import {
  currentWeekOf,
  defaultPeriod,
  hoursByMode,
  modeCardsOf,
  numbersOf,
  type Period,
  roundsByWeek,
} from '@/lib/profile-series';
import { ONE_DECIMAL, statsState, TWO_DECIMALS } from '@/lib/profile-stats';
import { playedParts } from '@/lib/ranking';
import { CollectingCard } from './collecting-card';
import { type CardView, StatsPanel, type TileView } from './stats-panel';

const MODE_COLOR: Record<GameMode, string> = {
  retake: 'var(--side-ct)',
  deathmatch: 'var(--side-t)',
};

/**
 * Estatísticas do Perfil (S12, V3): o seletor Esta semana / Total, os quatro números grandes com a tendência,
 * os cartões por Modo e os gráficos, tudo da série semanal e das somas. O que a API ainda não guarda (atividade
 * por dia, abates por arma e lado) aparece como "coletando", sem número. Num Perfil privado o visitante vê o
 * aviso no lugar dos números; o dono vê os seus, marcados "Só você vê".
 */
export async function ProfileStats({
  stats,
  series,
  name,
  isOwner,
  isPrivate,
}: {
  /** Nulo quando a API não respondeu: avisa, em vez de mostrar zeros. */
  stats: ProfileStatsData | null;
  /** Nula quando só a série falhou: o Perfil segue com as somas. */
  series: ProfileSeries | null;
  name: string;
  isOwner: boolean;
  isPrivate: boolean;
}) {
  const t = await getTranslations('profile.stats');
  const state = statsState(stats);

  if (stats === null || state === 'unavailable') {
    return (
      <p className="text-body-sm text-muted-foreground" data-testid="stats-unavailable">
        {t('unavailable')}
      </p>
    );
  }
  if (state === 'private') {
    return (
      <div className="v-panel v-panel-lg" data-testid="stats-private">
        <EmptyState icon={LockIcon} title={t('privateTitle')} body={t('privateBody', { name })} />
      </div>
    );
  }
  if (state === 'empty' || stats.total === null) {
    return (
      <div className="v-panel v-panel-lg" data-testid="stats-empty">
        <EmptyState
          icon={UsersIcon}
          title={t('emptyTitle')}
          body={isOwner ? t('emptyOwner') : t('emptyVisitor', { name })}
        />
      </div>
    );
  }

  const tr = await getTranslations('ranking');
  const format = await getFormatter();
  const total = stats.total;
  const none = t('none');
  const hasWeek = currentWeekOf(series) !== null;
  const periods: Period[] = hasWeek ? ['week', 'total'] : ['total'];

  const text = (key: string, value: number | null): string => {
    if (value === null) return none;
    if (key === 'kd' || key === 'kpm') return format.number(value, TWO_DECIMALS);
    if (key === 'headshotPercent') return `${format.number(value, ONE_DECIMAL)}%`;
    if (key === 'adr') return format.number(value, ONE_DECIMAL);
    if (key === 'timePlayed') {
      const time = playedParts(value);
      return time.hours > 0
        ? t('time.hoursMinutes', time)
        : t('time.minutes', { minutes: time.minutes });
    }
    return format.number(value);
  };

  const tiles = (period: Period): TileView[] =>
    numbersOf(period, total, series).map((n) => ({ ...n, label: t(`numbers.${n.key}`) }));
  const cards = (period: Period): CardView[] =>
    modeCardsOf(period, stats.modes, series).map((card) => ({
      mode: card.mode,
      title: tr(`modes.${card.mode}`),
      rows: card.rows.map((row) => ({
        key: row.key,
        label: t(`labels.${row.key}`),
        text: text(row.key, row.value),
      })),
    }));
  const chartsOf = (period: Period) => {
    const source =
      period === 'week' ? (currentWeekOf(series)?.headshotPercent ?? null) : total.headshotPercent;
    return {
      headshotPercent: source,
      hours: hoursByMode(period, series, stats.modes).map((entry) => ({
        mode: entry.mode,
        label: tr(`modes.${entry.mode}`),
        seconds: entry.seconds,
        color: MODE_COLOR[entry.mode],
      })),
    };
  };

  const aside =
    isOwner && isPrivate ? (
      <span
        data-testid="stats-only-you"
        className="inline-flex items-center gap-1.5 rounded-full bg-(--fill-rest) px-2.5 py-1 label-caps text-foreground"
      >
        {t('onlyYou')}
      </span>
    ) : null;

  return (
    <div className="grid gap-4">
      <StatsPanel
        title={t('title')}
        aside={aside}
        defaultPeriod={hasWeek ? defaultPeriod(series) : 'total'}
        periods={periods}
        labels={{
          period: t('period.label'),
          week: t('period.week'),
          total: t('period.total'),
          none,
          trend: t('trend'),
          groupLabel: t('groupLabel', { mode: '{mode}' }),
        }}
        tiles={{ week: hasWeek ? tiles('week') : [], total: tiles('total') }}
        cards={{ week: hasWeek ? cards('week') : [], total: cards('total') }}
        charts={{
          weeks: roundsByWeek(series),
          labels: {
            rounds: { title: t('charts.rounds.title'), note: t('charts.rounds.note') },
            head: {
              title: t('charts.head.title'),
              weekNote: t('charts.head.weekNote'),
              totalNote: t('charts.head.totalNote'),
              label: t('charts.head.label'),
              none: t('charts.head.none'),
            },
            hours: {
              title: t('charts.hours.title'),
              weekNote: t('charts.hours.weekNote', { hours: '{hours}' }),
              totalNote: t('charts.hours.totalNote', { hours: '{hours}' }),
              total: t('charts.hours.total'),
              none: t('charts.hours.none'),
            },
          },
          byPeriod: {
            week: hasWeek ? chartsOf('week') : chartsOf('total'),
            total: chartsOf('total'),
          },
        }}
      />

      <div className="grid gap-4 min-[900px]:grid-cols-2">
        <CollectingCard
          kind="heatmap"
          title={t('collecting.heatmap.title')}
          status={t('collecting.status')}
          body={t('collecting.heatmap.body')}
        />
        <CollectingCard
          kind="radar"
          title={t('collecting.radar.title')}
          status={t('collecting.status')}
          body={t('collecting.radar.body')}
        />
      </div>
    </div>
  );
}
