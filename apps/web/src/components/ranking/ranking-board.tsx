'use client';

import type { Ranking, RankingEntry } from '@carmine/contracts';
import { AnimatePresence, LayoutGroup, m } from 'framer-motion';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { PresenceAvatar, PresenceChip } from '@/components/presence';
import { useNowPlaying } from '@/components/session/use-now-playing';
import { Ticker } from '@/components/vida/ticker';
import { ONE_DECIMAL, TWO_DECIMALS } from '@/lib/profile-stats';
import { playedParts, rankingMoves } from '@/lib/ranking';
import { cn } from '@/lib/utils';
import './ranking.css';

/** De quanto em quanto tempo a semana atual é lida de novo (a API guarda a resposta por 45 s). */
const REFRESH_MS = 20_000;
/** Por quanto tempo as setas ▲▼ de uma troca ficam na tela. */
const MOVE_MS = 12_000;

const HEAD =
  'px-3 pb-2 font-semibold md:whitespace-nowrap label-caps leading-[1.25] text-muted-foreground';

/** Quem a linha é: o `publicId`, ou a posição para o Perfil privado (que não dá para seguir). */
const identity = (entry: RankingEntry) =>
  entry.player.publicId === null ? `private-${entry.position}` : String(entry.player.publicId);

/**
 * O Ranking como a Vida o desenha: pódio 2-1-3 com os três primeiros e a tabela do 4º em diante. As
 * trocas são animadas (FLIP) e ganham a seta ▲▼ só quando uma leitura nova da API de fato muda a
 * ordem: a semana atual é relida a cada 20 s com a aba à vista (e ao voltar a ela), e nada é
 * simulado. Os números rolam até o valor novo. Perfil privado ocupa a posição sem nome nem avatar.
 */
export function RankingBoard({ ranking }: { ranking: Ranking }) {
  const t = useTranslations('ranking');
  const router = useRouter();
  const retake = ranking.mode === 'retake';

  // ---- leitura ao vivo: relê a página do servidor; o que mudou vira o movimento das linhas.
  const [moves, setMoves] = useState<Map<number, number>>(new Map());
  const previous = useRef(ranking);
  useEffect(() => {
    const before = previous.current;
    previous.current = ranking;
    if (before === ranking) return;
    if (before.mode !== ranking.mode || before.weekStart !== ranking.weekStart) {
      setMoves(new Map());
      return;
    }
    const moved = rankingMoves(before.entries, ranking.entries);
    if (moved.size === 0) return;
    setMoves(moved);
    const timer = setTimeout(() => setMoves(new Map()), MOVE_MS);
    return () => clearTimeout(timer);
  }, [ranking]);

  const live = ranking.current;
  useEffect(() => {
    if (!live) return;
    const refresh = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [live, router]);

  // ---- presença de quem está vendo: só a própria Conta (a dos outros nunca vai para o Ranking).
  const hasSelf = ranking.entries.some((entry) => entry.self);
  const nowPlaying = useNowPlaying();
  useEffect(() => {
    if (!hasSelf) return;
    nowPlaying.load();
    const timer = setInterval(nowPlaying.load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [hasSelf, nowPlaying.load]);
  const selfPlaying = hasSelf && nowPlaying.server !== null;

  const podium = ranking.entries.slice(0, 3);
  // 2º, 1º, 3º: o primeiro no meio e mais alto.
  const order = [podium[1], podium[0], podium[2]].filter((entry) => entry !== undefined);
  const rest = ranking.entries.slice(3);

  return (
    <LayoutGroup>
      <div className="grid gap-6" data-testid="ranking-table">
        <ol
          aria-label={t('podium.label')}
          className="grid grid-cols-3 items-end gap-3 max-md:gap-2"
          data-testid="ranking-podium"
        >
          {order.map((entry) => (
            <PodiumSlot
              key={entry.position}
              entry={entry}
              retake={retake}
              move={moves.get(entry.player.publicId ?? -1) ?? 0}
              playing={entry.self && selfPlaying}
            />
          ))}
        </ol>

        {rest.length > 0 ? (
          <table className="w-full table-fixed border-separate border-spacing-y-0.5">
            <caption className="sr-only">
              {t('table.captionRest', {
                mode: t(`modes.${ranking.mode}`),
                first: rest[0]?.position ?? 4,
                last: rest[rest.length - 1]?.position ?? 4,
              })}
            </caption>
            <colgroup>
              <col className="w-14 md:w-24" />
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
              {rest.map((entry, index) => (
                <TableRow
                  key={identity(entry)}
                  entry={entry}
                  retake={retake}
                  index={index}
                  move={moves.get(entry.player.publicId ?? -1) ?? 0}
                  playing={entry.self && selfPlaying}
                />
              ))}
            </tbody>
          </table>
        ) : null}

        {/* O leitor de tela fica sabendo quando a lista mudou; as setas são só visuais. */}
        <p className="sr-only" role="status" data-testid="ranking-live-status">
          {moves.size > 0 ? t('live.updated') : ''}
        </p>
      </div>
    </LayoutGroup>
  );
}

/** A seta ▲▼ de quem acabou de mudar de posição. Some sozinha (a lista a zera depois de 12 s). */
function Move({ value }: { value: number }) {
  const t = useTranslations('ranking.move');
  return (
    <AnimatePresence initial={false}>
      {value !== 0 ? (
        <m.span
          key={value}
          data-testid="ranking-move"
          data-direction={value > 0 ? 'up' : 'down'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          role="img"
          aria-label={value > 0 ? t('up', { count: value }) : t('down', { count: -value })}
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-caption leading-tight font-bold tabular-nums',
            value > 0
              ? 'bg-status-online/20 text-status-online'
              : 'bg-status-danger/20 text-status-danger',
          )}
        >
          <span aria-hidden="true">{value > 0 ? '▲' : '▼'}</span>
          <span aria-hidden="true">{Math.abs(value)}</span>
        </m.span>
      ) : null}
    </AnimatePresence>
  );
}

function useStats(entry: RankingEntry, retake: boolean) {
  const format = useFormatter();
  const tp = useTranslations('profile.stats');
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
  return {
    headshot,
    played,
    kd: format.number(entry.kd, TWO_DECIMALS),
    score: retake ? entry.score : Number(entry.score.toFixed(2)),
  };
}

// Os degraus têm alturas mínimas acima do que o conteúdo ocupa, para a diferença aparecer sempre.
const SLOT_HEIGHT = [
  'min-h-[430px] max-md:min-h-[340px]',
  'min-h-[394px] max-md:min-h-[306px]',
  'min-h-[370px] max-md:min-h-[282px]',
];
const AVATAR_SIZE = [88, 72, 72];

/** Um degrau do pódio. O degrau é estável; quem está nele troca com um rolo quando a ordem muda. */
function PodiumSlot({
  entry,
  retake,
  move,
  playing,
}: {
  entry: RankingEntry;
  retake: boolean;
  move: number;
  playing: boolean;
}) {
  const t = useTranslations('ranking');
  const stats = useStats(entry, retake);
  const { player } = entry;
  const place = entry.position - 1;

  return (
    <li
      data-testid="ranking-row"
      data-position={entry.position}
      data-self={entry.self || undefined}
      data-private={player.private || undefined}
      id={entry.self ? 'minha-linha' : undefined}
      className={cn(
        'rk-slot v-panel v-panel-lg v-spot relative flex min-w-0 scroll-mt-24 flex-col items-center gap-2 overflow-hidden px-3 pt-5 text-center max-md:px-2',
        SLOT_HEIGHT[place] ?? SLOT_HEIGHT[2],
        entry.self && 'bg-(--fill-selected)',
      )}
      data-place={entry.position}
    >
      <span aria-hidden="true" className="rk-slot-glow" />
      <span className="v-sign text-[clamp(60px,7vw,104px)] text-foreground">{entry.position}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={identity(entry)}
          initial={{ y: 26, opacity: 0, filter: 'blur(4px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -26, opacity: 0, filter: 'blur(4px)' }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          className="grid min-w-0 justify-items-center gap-2 pb-6 max-md:pb-4"
        >
          {player.private ? (
            <span
              aria-hidden="true"
              className="inline-block shrink-0 rounded-full bg-surface-2"
              style={{ width: AVATAR_SIZE[place] ?? 72, height: AVATAR_SIZE[place] ?? 72 }}
            />
          ) : (
            <PresenceAvatar
              playing={playing}
              label={t('playingNow')}
              src={player.avatarUrl}
              name={player.displayName}
              size={AVATAR_SIZE[place] ?? 72}
            />
          )}
          {player.private ? (
            <span className="text-muted-foreground italic [overflow-wrap:anywhere]">
              {t('privatePlayer')}
            </span>
          ) : (
            <Link
              href={`/${player.publicId}` as Route}
              className="max-w-full rounded-xs text-[17px] font-bold tracking-[-0.02em] [overflow-wrap:anywhere] underline decoration-foreground/30 underline-offset-(--underline-offset) transition-[text-decoration-color] duration-(--dur-fast) ease-std hover:decoration-foreground focus-visible:outline-offset-2"
            >
              {player.displayName}
            </Link>
          )}
          <span className="flex flex-wrap items-center justify-center gap-1.5">
            {entry.self ? (
              <span className="shrink-0 rounded-sm bg-surface px-1.5 py-[3px] label-caps text-foreground">
                {t('you')}
              </span>
            ) : null}
            {playing ? <PresenceChip>{t('playingNow')}</PresenceChip> : null}
            <Move value={move} />
          </span>
          <span className="v-sign text-[clamp(34px,3.4vw,52px)]">
            <Ticker value={stats.score} decimals={retake ? 0 : 2} />
          </span>
          <span className="text-caption text-muted-foreground">
            {retake ? t('podium.unitRetake') : t('podium.unitDeathmatch')}
          </span>
          <span className="text-caption text-muted-foreground max-md:hidden">
            {t('podium.stats', { kd: stats.kd, hs: stats.headshot })}
          </span>
          <span
            className="text-caption text-muted-foreground md:hidden"
            data-testid="ranking-row-extra"
          >
            {t(retake ? 'table.extraRetake' : 'table.extraDeathmatch', {
              hs: stats.headshot,
              value: stats.played,
            })}
          </span>
        </m.div>
      </AnimatePresence>
    </li>
  );
}

function TableRow({
  entry,
  retake,
  index,
  move,
  playing,
}: {
  entry: RankingEntry;
  retake: boolean;
  index: number;
  move: number;
  playing: boolean;
}) {
  const t = useTranslations('ranking');
  const stats = useStats(entry, retake);
  const { player } = entry;
  // O fundo vai nas células (a linha não arredonda): hover e "Você" cobrem a linha toda.
  const cell = cn(
    'h-14 px-3 py-2 text-sm max-md:px-2 tabular-nums transition-colors duration-(--dur-fast) ease-std first:rounded-l-lg last:rounded-r-lg',
    entry.self ? 'bg-(--fill-selected)' : 'group-hover/row:bg-surface',
  );

  return (
    <m.tr
      layout="position"
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      data-testid="ranking-row"
      data-position={entry.position}
      id={entry.self ? 'minha-linha' : undefined}
      data-self={entry.self || undefined}
      data-private={player.private || undefined}
      style={{ '--i': index } as CSSProperties}
      // Sobre o fundo de "Você" o texto secundário sobe de tom: o cinza comum fica abaixo de 4,5:1 ali.
      className="group/row enter-stagger scroll-mt-24 data-[self]:[--muted-foreground:color-mix(in_srgb,var(--text)_78%,var(--muted))]"
    >
      <td className={cn(cell, 'font-semibold text-muted-foreground')}>
        <span className="flex items-center gap-2">
          <span className="v-sign text-[26px] text-foreground">{entry.position}</span>
          <Move value={move} />
        </span>
      </td>
      <th scope="row" className={cn(cell, 'min-w-0 text-left font-normal')}>
        <div className="flex min-w-0 items-center gap-3 max-md:gap-2">
          {player.private ? (
            <span
              aria-hidden="true"
              className="inline-block size-9 shrink-0 rounded-full bg-surface-2"
            />
          ) : (
            <PresenceAvatar
              playing={playing}
              label={t('playingNow')}
              src={player.avatarUrl}
              name={player.displayName}
              size={36}
            />
          )}
          <div className="flex min-w-0 flex-col md:flex-row md:items-center md:gap-3">
            {player.private ? (
              <span className="text-muted-foreground italic max-md:[overflow-wrap:anywhere] md:truncate">
                {t('privatePlayer')}
              </span>
            ) : (
              <Link
                href={`/${player.publicId}` as Route}
                className="min-w-0 rounded-xs font-semibold underline max-md:[overflow-wrap:anywhere] md:truncate decoration-foreground/30 underline-offset-(--underline-offset) transition-[text-decoration-color] duration-(--dur-fast) ease-std hover:decoration-foreground focus-visible:outline-offset-2"
              >
                {player.displayName}
              </Link>
            )}
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground md:contents">
              {entry.self ? (
                <span className="shrink-0 rounded-sm bg-surface px-1.5 py-[3px] label-caps text-foreground">
                  {t('you')}
                </span>
              ) : null}
              {playing ? <PresenceChip>{t('playingNow')}</PresenceChip> : null}
              <span className="min-w-0 md:hidden" data-testid="ranking-row-extra">
                {t(retake ? 'table.extraRetake' : 'table.extraDeathmatch', {
                  hs: stats.headshot,
                  value: stats.played,
                })}
              </span>
            </span>
          </div>
        </div>
      </th>
      <td className={cn(cell, 'text-right font-semibold')}>
        <span className="v-sign text-[22px]">
          <Ticker value={stats.score} decimals={retake ? 0 : 2} />
        </span>
      </td>
      <td className={cn(cell, 'text-right')}>{stats.kd}</td>
      <td className={cn(cell, 'text-right text-muted-foreground max-md:hidden')}>
        {stats.headshot}
      </td>
      <td className={cn(cell, 'text-right text-muted-foreground max-md:hidden')}>{stats.played}</td>
    </m.tr>
  );
}
