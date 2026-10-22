import type { Ranking, RankingEntry } from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { Avatar } from '@/components/avatar';
import { ONE_DECIMAL, TWO_DECIMALS } from '@/lib/profile-stats';
import { playedParts } from '@/lib/ranking';
import { cn } from '@/lib/utils';

const HEAD =
  'px-3 pb-2 font-semibold md:whitespace-nowrap label-caps leading-[1.25] text-muted-foreground';

/**
 * O top 50 numa tabela de verdade (cabeçalhos e legenda para o leitor de tela), com números
 * tabulares alinhados à direita. As posições 1 a 3 vão em DM Serif; a linha de quem está vendo
 * ganha o fundo e "Você". O que não cabe no celular (HS% e rounds) desce para uma segunda linha
 * sob o nome, em vez de sumir ou de rolar para o lado.
 */
export async function RankingTable({ ranking }: { ranking: Ranking }) {
  const t = await getTranslations('ranking');
  const format = await getFormatter();
  const retake = ranking.mode === 'retake';
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <table
      className="w-full table-fixed border-separate border-spacing-y-0.5"
      data-testid="ranking-table"
    >
      <caption className="sr-only">
        {t('table.caption', {
          mode: t(`modes.${ranking.mode}`),
          size: ranking.entries.length,
          range: t('week.range', { start: day(ranking.weekStart), end: day(ranking.weekEnd) }),
        })}
      </caption>
      <colgroup>
        <col className="w-10 md:w-14" />
        <col />
        <col className="w-[4.5rem] md:w-32" />
        <col className="w-14 md:w-20" />
        <col className="w-20 max-md:hidden" />
        <col className="w-24 max-md:hidden" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={cn(HEAD, 'text-left')}>
            <span className="sr-only">{t('table.position')}</span>
            <span aria-hidden="true">#</span>
          </th>
          <th scope="col" className={cn(HEAD, 'text-left')}>
            {t('table.player')}
          </th>
          <th scope="col" className={cn(HEAD, 'text-right')}>
            {retake ? t('table.roundsWon') : t('table.kpm')}
          </th>
          <th scope="col" className={cn(HEAD, 'text-right')}>
            {t('table.kd')}
          </th>
          <th scope="col" className={cn(HEAD, 'text-right max-md:hidden')}>
            {t('table.headshotPercent')}
          </th>
          <th scope="col" className={cn(HEAD, 'text-right max-md:hidden')}>
            {retake ? t('table.roundsPlayed') : t('table.timePlayed')}
          </th>
        </tr>
      </thead>
      <tbody>
        {ranking.entries.map((entry, index) => (
          <Row key={entry.position} entry={entry} retake={retake} index={index} />
        ))}
      </tbody>
    </table>
  );
}

async function Row({
  entry,
  retake,
  index,
}: {
  entry: RankingEntry;
  retake: boolean;
  index: number;
}) {
  const t = await getTranslations('ranking');
  const tp = await getTranslations('profile.stats');
  const format = await getFormatter();
  const { player } = entry;
  const time = playedParts(entry.secondsPlayed);
  const headshot =
    entry.headshotPercent === null
      ? tp('none')
      : `${format.number(entry.headshotPercent, ONE_DECIMAL)}%`;
  const played = retake
    ? format.number(entry.roundsPlayed)
    : time.hours > 0
      ? tp('time.hoursMinutes', time)
      : tp('time.minutes', { minutes: time.minutes });
  const podium = entry.position <= 3;
  // O fundo vai nas células (a linha não arredonda): hover e "Você" cobrem a linha toda.
  const cell = cn(
    'h-14 px-3 py-2 text-sm tabular-nums transition-colors duration-(--dur-fast) ease-std first:rounded-l-lg last:rounded-r-lg',
    entry.self ? 'bg-(--fill-selected)' : 'group-hover/row:bg-surface',
  );

  return (
    <tr
      data-testid="ranking-row"
      data-position={entry.position}
      data-self={entry.self || undefined}
      data-private={player.private || undefined}
      style={{ '--i': index } as CSSProperties}
      className="group/row enter-stagger"
    >
      <td
        className={cn(
          cell,
          podium
            ? 'font-display text-[26px] leading-none font-normal text-foreground'
            : 'font-semibold text-muted-foreground',
        )}
      >
        {entry.position}
      </td>
      <th scope="row" className={cn(cell, 'min-w-0 text-left font-normal')}>
        <div className="flex min-w-0 items-center gap-3">
          {player.private ? (
            <span
              aria-hidden="true"
              className="inline-block size-8 shrink-0 rounded-full bg-surface-2"
            />
          ) : (
            <Avatar src={player.avatarUrl} name={player.displayName} size={32} />
          )}
          <div className="flex min-w-0 flex-col md:flex-row md:items-center md:gap-3">
            {player.private ? (
              <span className="truncate text-muted-foreground italic">{t('privatePlayer')}</span>
            ) : (
              <Link
                href={`/${player.publicId}` as Route}
                className="min-w-0 truncate rounded-xs font-semibold underline decoration-foreground/30 underline-offset-(--underline-offset) transition-[text-decoration-color] duration-(--dur-fast) ease-std hover:decoration-foreground focus-visible:outline-offset-2"
              >
                {player.displayName}
              </Link>
            )}
            <span className="flex items-center gap-2 text-xs text-muted-foreground md:contents">
              {entry.self ? (
                <span className="shrink-0 rounded-sm bg-surface px-1.5 py-[3px] label-caps text-foreground">
                  {t('you')}
                </span>
              ) : null}
              <span className="min-w-0 truncate md:hidden" data-testid="ranking-row-extra">
                {t(retake ? 'table.extraRetake' : 'table.extraDeathmatch', {
                  hs: headshot,
                  value: played,
                })}
              </span>
            </span>
          </div>
        </div>
      </th>
      <td className={cn(cell, 'text-right font-semibold')}>
        {retake ? format.number(entry.score) : format.number(entry.score, TWO_DECIMALS)}
      </td>
      <td className={cn(cell, 'text-right')}>{format.number(entry.kd, TWO_DECIMALS)}</td>
      <td className={cn(cell, 'text-right text-muted-foreground max-md:hidden')}>{headshot}</td>
      <td className={cn(cell, 'text-right text-muted-foreground max-md:hidden')}>{played}</td>
    </tr>
  );
}
