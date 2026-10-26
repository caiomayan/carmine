'use client';

import type { LiveServer } from '@carmine/contracts';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PlayerAvatar } from '@/components/home/player-avatar';
import { StatusDot } from '@/components/status-dot';
import { Ticker } from '@/components/vida/ticker';
import { mapDisplayName } from '@/lib/map-art';
import type { Match, RosterPlayer, Side, Today } from '@/lib/server-page/types';
import { ctShare, currentMap, minutesOnMap, rankedAll } from '@/lib/server-page/view';
import { RollingDigits } from './rolling-digits';

/**
 * Os cartões de vidro ao lado do nome do servidor: o placar ao vivo CT × TR (Retake), o líder (Deathmatch), o
 * aquecimento, o servidor vazio e o servidor dormindo. Só um aparece por vez; quem escolhe é `ServerPageView`.
 */

function sideName(t: ReturnType<typeof useTranslations>, side: Side) {
  return t(side === 'ct' ? 'score.ctName' : 'score.tName');
}

/** Jogadores agora / vagas, com a barra. */
export function Slots({ count, max }: { count: number; max: number }) {
  const t = useTranslations('serverPage.score');
  return (
    <div className="vs-slots">
      <p>
        <span className="tabular-nums">
          <Ticker value={count} />
          <span className="text-muted-foreground">/{max}</span>
        </span>{' '}
        <span className="text-muted-foreground">{t('players')}</span>
      </p>
      <div className="vh-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.min(1, count / max)})` }} />
      </div>
    </div>
  );
}

export function LiveScoreCard({ match, server }: { match: Match; server: LiveServer }) {
  const t = useTranslations('serverPage');
  const share = ctShare(match.ctScore, match.tScore);
  const lead: Side | null =
    match.ctScore === match.tScore ? null : match.ctScore > match.tScore ? 'ct' : 't';

  return (
    <section
      className="vs-score"
      aria-labelledby="vs-score-title"
      data-kind="live"
      data-testid="placar"
    >
      <div className="vs-score-top">
        <p id="vs-score-title" className="v-label vs-live">
          <StatusDot tone="online" pulse /> {t('score.live')}
        </p>
        <p className="v-label vs-round">
          {t('score.round')} <RollingDigits value={match.round} className="vs-round-digits" />
        </p>
      </div>

      <div className="vs-board">
        <Team side="ct" score={match.ctScore} dim={lead === 't'} />
        <span aria-hidden="true" className="vs-colon">
          ×
        </span>
        <Team side="t" score={match.tScore} dim={lead === 'ct'} />
      </div>

      <div className="vs-split" aria-hidden="true">
        <i data-side="ct" style={{ '--rest': `${100 - share}%` } as React.CSSProperties} />
      </div>
      <p className="vs-score-cap">{t('score.caption')}</p>

      <Slots count={server.players} max={server.maxPlayers} />
    </section>
  );
}

function Team({ side, score, dim }: { side: Side; score: number; dim: boolean }) {
  const t = useTranslations('serverPage');
  return (
    <div className="vs-team" data-side={side} data-dim={dim || undefined}>
      <span className="vs-team-label">
        <span aria-hidden="true" className="vs-dot" />
        <abbr title={sideName(t, side)}>{t(side === 'ct' ? 'score.ct' : 'score.t')}</abbr>
      </span>
      <span className="vs-score-digits v-sign">
        <RollingDigits value={score} />
      </span>
    </div>
  );
}

export function WarmupCard({ server }: { server: LiveServer }) {
  const t = useTranslations('serverPage.score');
  return (
    <section className="vs-score" aria-labelledby="vs-score-title" data-kind="warmup">
      <p id="vs-score-title" className="v-label vs-live">
        <StatusDot tone="warn" pulse /> {t('warmupLabel')}
      </p>
      <p className="vs-score-big v-serif">{t('warmupTitle')}</p>
      <p className="vs-score-lead">{t('warmupBody')}</p>
      <Slots count={server.players} max={server.maxPlayers} />
    </section>
  );
}

/** Servidor com gente, mas sem placar (nem aquecimento): só as vagas. */
export function SlotsCard({ server }: { server: LiveServer }) {
  const t = useTranslations('serverPage.score');
  return (
    <section className="vs-score" aria-labelledby="vs-score-title" data-kind="slots">
      <p id="vs-score-title" className="v-label vs-live">
        <StatusDot tone="online" pulse /> {t('live')}
      </p>
      <Slots count={server.players} max={server.maxPlayers} />
    </section>
  );
}

export function EmptyCard({ server, modeLabel }: { server: LiveServer; modeLabel: string }) {
  const t = useTranslations('serverPage.score');
  return (
    <section className="vs-score" aria-labelledby="vs-score-title" data-kind="empty">
      <p id="vs-score-title" className="v-label">
        {t('emptyLabel')}
      </p>
      <p className="vs-score-big v-serif">{t('emptyTitle')}</p>
      <p className="vs-score-lead">{t('emptyBody', { mode: modeLabel })}</p>
      <Slots count={0} max={server.maxPlayers} />
    </section>
  );
}

/** O servidor dormindo: sem placar vivo; com o histórico do dia à mão, diz como terminou o último mapa. */
export function OfflineCard({ server, today }: { server: LiveServer; today: Today | null }) {
  const t = useTranslations('serverPage.score');
  const last = today?.maps.at(-1) ?? null;
  const showLast = last !== null && last.ctWins !== null && last.tWins !== null;
  return (
    <section className="vs-score" aria-labelledby="vs-score-title" data-kind="offline">
      <p id="vs-score-title" className="v-label">
        {t('offlineLabel')}
      </p>
      <p className="vs-score-big v-serif">{t('offlineTitle')}</p>
      {showLast ? (
        <p className="vs-score-lead">
          {t.rich('offlineLast', {
            map: mapDisplayName(last.map) ?? '',
            ct: last.ctWins ?? 0,
            t: last.tWins ?? 0,
            rounds: last.rounds ?? 0,
            b: (chunks) => <b>{chunks}</b>,
          })}
        </p>
      ) : null}
      <Slots count={0} max={server.maxPlayers} />
    </section>
  );
}

/** O Deathmatch não tem placar de times: o cartão é o líder, quantos pontos à frente e há quanto tempo no mapa. */
export function LeaderCard({
  players,
  today,
  server,
}: {
  players: readonly RosterPlayer[];
  today: Today | null;
  server: LiveServer;
}) {
  const t = useTranslations('serverPage.leader');
  const order = rankedAll(players);
  const leader = order[0];
  const second = order[1];
  const minutes = today && currentMap(today) ? minutesOnMap(today) : null;
  if (!leader) return null;
  const ahead = second ? leader.score - second.score : null;

  return (
    <section
      className="vs-score vs-leader"
      aria-labelledby="vs-score-title"
      data-kind="leader"
      data-testid="lider"
    >
      <div className="vs-score-top">
        <p id="vs-score-title" className="v-label vs-live">
          <StatusDot tone="online" pulse /> {t('label')}
        </p>
        {minutes !== null ? <p className="v-label vs-round">{t('onMap', { minutes })}</p> : null}
      </div>

      <div key={leader.id} className="vs-leader-who">
        {leader.name === null ? (
          <>
            <span className="vs-anon vs-anon-lg">
              <span aria-hidden="true" className="vs-anon-disc" />
            </span>
            <span className="vs-leader-name vs-private">{t('private')}</span>
          </>
        ) : (
          <>
            <PlayerAvatar src={leader.avatarUrl} name={leader.name} size={56} playing />
            {leader.publicId === null ? (
              <span className="vs-leader-name">{leader.name}</span>
            ) : (
              <Link href={`/${leader.publicId}` as never} className="vs-leader-name">
                {leader.name}
              </Link>
            )}
          </>
        )}
      </div>

      <div className="vs-leader-score">
        <span className="vs-score-digits v-sign">
          <RollingDigits value={leader.score} />
        </span>
        <span className="vs-leader-stats">
          <span className="v-label">{t('points')}</span>
          <span className="tabular-nums">
            <RollingDigits value={leader.kills} /> {t('kills')} ·{' '}
            <RollingDigits value={leader.deaths} /> {t('deaths')}
          </span>
        </span>
      </div>

      <p className="vs-score-cap">{ahead === null ? t('alone') : t('ahead', { points: ahead })}</p>

      <Slots count={server.players} max={server.maxPlayers} />
    </section>
  );
}
