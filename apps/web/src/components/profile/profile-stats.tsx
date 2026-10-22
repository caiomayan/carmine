import type { ModeStats, ProfileStats as ProfileStatsData, TotalStats } from '@carmine/contracts';
import { getFormatter, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { LockIcon } from '@/components/icons/animated/lock';
import { UsersIcon } from '@/components/icons/animated/users';
import { SectionTitle } from '@/components/section-title';
import { highlightsOf, ONE_DECIMAL, statsState, TWO_DECIMALS } from '@/lib/profile-stats';
import { playedParts } from '@/lib/ranking';

/**
 * Estatísticas do Perfil (S12): três números de destaque (K/D, Kills e HS%, em DM Serif) e, abaixo,
 * a tabela por Modo e no total. No total só entram os números que se somam
 * entre Modos (ADR só no Retake, KPM só no Deathmatch). Num Perfil privado o visitante vê o
 * aviso no lugar dos números; o dono vê os seus, marcados "Só você vê".
 */
export async function ProfileStats({
  stats,
  name,
  isOwner,
  isPrivate,
}: {
  /** Nulo quando a API não respondeu: avisa, em vez de mostrar zeros. */
  stats: ProfileStatsData | null;
  name: string;
  isOwner: boolean;
  isPrivate: boolean;
}) {
  const t = await getTranslations('profile.stats');

  const aside =
    isOwner && isPrivate ? (
      <span
        data-testid="stats-only-you"
        className="inline-flex items-center gap-1.5 rounded-sm bg-surface-2 px-2 py-[3px] label-caps text-foreground"
      >
        {t('onlyYou')}
      </span>
    ) : null;

  return (
    <section
      aria-labelledby="estatisticas"
      data-testid="profile-stats"
      className="animate-fade-up pt-8 [animation-delay:80ms]"
    >
      <SectionTitle id="estatisticas" aside={aside}>
        {t('title')}
      </SectionTitle>
      <Body stats={stats} name={name} isOwner={isOwner} />
    </section>
  );
}

async function Body({
  stats,
  name,
  isOwner,
}: {
  stats: ProfileStatsData | null;
  name: string;
  isOwner: boolean;
}) {
  const t = await getTranslations('profile.stats');
  const tr = await getTranslations('ranking');

  if (stats === null) {
    return (
      <p className="text-body-sm text-muted-foreground" data-testid="stats-unavailable">
        {t('unavailable')}
      </p>
    );
  }
  const state = statsState(stats);
  if (state === 'private') {
    return (
      <div className="rounded-xl bg-surface" data-testid="stats-private">
        <EmptyState icon={LockIcon} title={t('privateTitle')} body={t('privateBody', { name })} />
      </div>
    );
  }
  if (state === 'empty' || stats.total === null) {
    return (
      <div className="rounded-xl bg-surface" data-testid="stats-empty">
        <EmptyState
          icon={UsersIcon}
          title={t('emptyTitle')}
          body={isOwner ? t('emptyOwner') : t('emptyVisitor', { name })}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-8">
      <Highlights total={stats.total} />
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-3">
        <Group testId="stats-total" label={t('total')}>
          <Rows stats={stats.total} />
        </Group>
        {stats.modes.map((mode) => (
          <Group key={mode.mode} testId={`stats-${mode.mode}`} label={tr(`modes.${mode.mode}`)}>
            <Rows stats={mode} mode={mode} />
          </Group>
        ))}
      </div>
    </div>
  );
}

/** K/D, Kills e HS% grandes, em DM Serif sobre cartões de superfície: o que se lê primeiro. */
async function Highlights({ total }: { total: TotalStats }) {
  const t = await getTranslations('profile.stats');
  const format = await getFormatter();
  const show = (key: string, value: number | null) => {
    if (value === null) return t('none');
    if (key === 'kd') return format.number(value, TWO_DECIMALS);
    if (key === 'headshotPercent') return `${format.number(value, ONE_DECIMAL)}%`;
    return format.number(value);
  };

  return (
    <dl className="grid grid-cols-3 gap-2.5 max-md:gap-2" data-testid="stats-highlights">
      {highlightsOf(total).map(({ key, value }) => (
        <div
          key={key}
          data-highlight={key}
          className="flex min-w-0 flex-col-reverse gap-2 rounded-xl bg-surface px-5 py-4 max-md:px-3.5 max-md:py-3"
        >
          <dt className="label-caps text-muted-foreground">{t(`labels.${key}`)}</dt>
          <dd className="truncate font-display text-[40px] leading-none font-normal tabular-nums max-md:text-[28px]">
            {show(key, value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

async function Group({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations('profile.stats');
  return (
    <section data-testid={testId} aria-label={t('groupLabel', { mode: label })}>
      <h3 className="pb-2 label-caps text-muted-foreground">{label}</h3>
      <dl className="grid">{children}</dl>
    </section>
  );
}

async function Rows({ stats, mode }: { stats: TotalStats; mode?: ModeStats }) {
  const t = await getTranslations('profile.stats');
  const format = await getFormatter();
  const time = playedParts(stats.secondsPlayed);
  const rows: [key: string, label: string, value: string][] = [
    ['kills', t('labels.kills'), format.number(stats.kills)],
    ['deaths', t('labels.deaths'), format.number(stats.deaths)],
    ['assists', t('labels.assists'), format.number(stats.assists)],
    ['kd', t('labels.kd'), format.number(stats.kd, TWO_DECIMALS)],
    [
      'headshotPercent',
      t('labels.headshotPercent'),
      stats.headshotPercent === null
        ? t('none')
        : `${format.number(stats.headshotPercent, ONE_DECIMAL)}%`,
    ],
  ];
  if (mode?.mode === 'retake') {
    rows.push([
      'adr',
      t('labels.adr'),
      mode.adr === null ? t('none') : format.number(mode.adr, ONE_DECIMAL),
    ]);
  }
  if (mode?.mode === 'deathmatch') {
    rows.push([
      'kpm',
      t('labels.kpm'),
      mode.kpm === null ? t('none') : format.number(mode.kpm, TWO_DECIMALS),
    ]);
  }
  rows.push([
    'timePlayed',
    t('labels.timePlayed'),
    time.hours > 0 ? t('time.hoursMinutes', time) : t('time.minutes', { minutes: time.minutes }),
  ]);

  return (
    <>
      {rows.map(([key, label, value]) => (
        <div
          key={key}
          data-stat={key}
          className="flex items-baseline justify-between gap-4 rounded-md px-2 py-1.5 -mx-2 text-sm transition-colors duration-(--dur-fast) ease-std hover:bg-surface"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </>
  );
}
