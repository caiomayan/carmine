'use client';

import type { LiveServer } from '@carmine/contracts';
import { m } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PlayerAvatar } from '@/components/home/player-avatar';
import { StatusDot } from '@/components/status-dot';
import type { Collectable, Roster, RosterPlayer, Side } from '@/lib/server-page/types';
import {
  alphabeticalBySide,
  killDeathRatio,
  namesOnly,
  rankedAll,
  rankedBySide,
} from '@/lib/server-page/view';
import { cn } from '@/lib/utils';
import { CollectingBlock } from './collecting-block';
import { RollingDigits } from './rolling-digits';

/**
 * Os jogadores do servidor. Retake: dois painéis (CT e TR) em ordem de placar, ou em ordem alfabética e sem números
 * no aquecimento. Deathmatch: uma lista única por pontos. O Perfil privado é uma linha anônima ("Jogador privado",
 * sem link) que conta no total. Sem a lista da API ainda, o bloco "coletando" (a contagem de agora, que a lista ao
 * vivo já traz, continua aparecendo).
 */
export function RosterSection({
  server,
  roster,
  warmup,
}: {
  server: LiveServer;
  roster: Collectable<Roster>;
  warmup: boolean;
}) {
  const t = useTranslations('serverPage.roster');
  const live = server.state !== 'offline';
  const dm = server.mode === 'deathmatch';
  const players = roster.status === 'ready' ? roster.data.players : [];
  // Sem o placar por jogador (plugin antigo) não há time nem número: só os nomes, em ordem alfabética.
  const scoreboard = roster.status === 'ready' ? roster.data.scoreboard : true;

  return (
    <section aria-labelledby="vs-roster" className="vs-section" data-testid="jogadores">
      <div className="vs-section-head">
        <h2 id="vs-roster" className="v-title">
          {t('title')}
        </h2>
        {live && server.players > 0 ? (
          <p className="vs-section-note">{t('count', { count: server.players })}</p>
        ) : null}
      </div>

      {roster.status === 'collecting' ? (
        <CollectingBlock kind="roster" since={roster.since} />
      ) : players.length === 0 ? (
        <div className="vs-empty">
          <p className="vs-empty-title">{live ? t('emptyLive') : t('emptyOffline')}</p>
          <p>{live ? t('emptyLiveBody') : t('emptyOfflineBody')}</p>
        </div>
      ) : !scoreboard ? (
        <div className="vs-teams" data-single>
          <AllList players={namesOnly(players)} numbers={false} />
        </div>
      ) : dm ? (
        <div className="vs-teams" data-single>
          <AllList players={rankedAll(players)} numbers />
        </div>
      ) : (
        <div className="vs-teams">
          {(['ct', 't'] as const).map((side) => (
            <TeamList
              key={side}
              side={side}
              players={warmup ? alphabeticalBySide(players, side) : rankedBySide(players, side)}
              warmup={warmup}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TeamList({
  side,
  players,
  warmup,
}: {
  side: Side;
  players: RosterPlayer[];
  warmup: boolean;
}) {
  const t = useTranslations('serverPage');
  const name = t(side === 'ct' ? 'score.ctName' : 'score.tName');
  return (
    <div className="vs-team-panel" data-side={side} data-warmup={warmup || undefined}>
      <div className="vs-team-head">
        <span className="vs-team-title">
          <span aria-hidden="true" className="vs-dot" />
          {name}
        </span>
        {warmup ? (
          <span className="vs-badge">
            <StatusDot tone="warn" pulse /> {t('roster.warmup')}
          </span>
        ) : (
          <Columns />
        )}
      </div>
      <ul aria-label={name} className="vs-rows">
        {players.map((player, index) => (
          <PlayerRow
            key={player.id}
            player={player}
            rank={warmup ? null : index + 1}
            numbers={!warmup}
          />
        ))}
      </ul>
    </div>
  );
}

/** A lista única: o Deathmatch (todos contra todos, por pontos) ou, sem o placar por jogador, só os nomes. */
function AllList({ players, numbers }: { players: RosterPlayer[]; numbers: boolean }) {
  const t = useTranslations('serverPage.roster');
  return (
    <div className="vs-team-panel" data-side="all">
      <div className="vs-team-head">
        <span className="vs-team-title">{numbers ? t('allTitle') : t('namesTitle')}</span>
        {numbers ? <Columns ratio /> : null}
      </div>
      <ul aria-label={numbers ? t('allAria') : t('namesAria')} className="vs-rows">
        {players.map((player, index) => (
          <PlayerRow
            key={player.id}
            player={player}
            rank={numbers ? index + 1 : null}
            numbers={numbers}
            ratio={numbers}
          />
        ))}
      </ul>
    </div>
  );
}

/** O cabeçalho das colunas de números: por extenso no desktop, a inicial no celular. */
function Columns({ ratio = false }: { ratio?: boolean }) {
  const t = useTranslations('serverPage.roster');
  return (
    <span className="vs-cols" data-cols={ratio ? '4' : undefined} aria-hidden="true">
      <span>
        <span className="max-md:hidden">{t('kills')}</span>
        <span className="md:hidden">{t('killsShort')}</span>
      </span>
      <span>
        <span className="max-md:hidden">{t('deaths')}</span>
        <span className="md:hidden">{t('deathsShort')}</span>
      </span>
      {ratio ? <span className="max-md:hidden">{t('ratio')}</span> : null}
      <span>
        <span className="max-md:hidden">{t('points')}</span>
        <span className="md:hidden">{t('pointsShort')}</span>
      </span>
    </span>
  );
}

function PlayerRow({
  player,
  rank,
  numbers,
  ratio = false,
}: {
  player: RosterPlayer;
  rank: number | null;
  numbers: boolean;
  ratio?: boolean;
}) {
  const t = useTranslations('serverPage.roster');
  return (
    <m.li
      layout="position"
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className="vs-row"
      data-private={player.name === null || undefined}
      data-first={rank === 1 || undefined}
      data-bare={rank === null || undefined}
      data-testid="jogador"
    >
      {rank !== null ? (
        <span className="vs-rank v-sign" aria-hidden="true">
          {rank}
        </span>
      ) : null}
      <span className="vs-who">
        {player.name === null ? (
          <>
            <span className="vs-anon">
              <span aria-hidden="true" className="vs-anon-disc" />
              <span aria-hidden="true" className="vs-presence" />
            </span>
            <span className="vs-private">{t('private')}</span>
          </>
        ) : (
          <>
            <PlayerAvatar src={player.avatarUrl} name={player.name} size={36} playing />
            {player.publicId === null ? (
              <span className="vs-player-name">{player.name}</span>
            ) : (
              <Link href={`/${player.publicId}` as never} className="vs-player-link">
                {player.name}
              </Link>
            )}
          </>
        )}
      </span>
      {numbers ? (
        <span className="vs-nums" data-cols={ratio ? '4' : undefined}>
          <Stat label={t('kills')} value={player.kills} />
          <Stat label={t('deaths')} value={player.deaths} />
          {ratio ? (
            <span className="vs-stat vs-ratio max-md:hidden tabular-nums">
              <span className="sr-only">{t('ratioSr')} </span>
              {killDeathRatio(player)}
            </span>
          ) : null}
          <Stat label={t('points')} value={player.score} strong />
        </span>
      ) : null}
    </m.li>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <span className={cn('vs-stat', strong && 'vs-stat-strong')}>
      <span className="sr-only">{label} </span>
      <RollingDigits value={value} />
    </span>
  );
}
