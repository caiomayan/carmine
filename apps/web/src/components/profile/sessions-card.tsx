import type { ProfileSession, ProfileSessions } from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { CollectingCard } from '@/components/profile/collecting-card';
import { StatusDot } from '@/components/status-dot';
import { mapDisplayName } from '@/lib/map-art';
import { playedParts } from '@/lib/ranking';

const BRASILIA = 'America/Sao_Paulo';

/**
 * As Sessões de jogo do Perfil (S12b). Sem resposta da API (`sessions` nulo) o cartão diz que não carregou; sem
 * nenhuma Sessão ainda, volta à cena quieta "coletando". De fora só vêm Modo, mapa, dia e duração (ADR 0018); a
 * hora do relógio é da própria Conta e o servidor aparece só na Sessão em andamento, que qualquer pessoa vê.
 */
export async function SessionsCard({ sessions }: { sessions: ProfileSessions | null }) {
  const t = await getTranslations('profile.sessions');
  const tc = await getTranslations('profile.stats.collecting');

  if (sessions === null) {
    return (
      <CollectingCard
        kind="sessions"
        title={t('title')}
        status={t('unavailableStatus')}
        body={t('unavailableBody')}
      />
    );
  }
  // Perfil que o visitante não pode ver: nada de cartão (uma lista vazia aqui seria dado inventado).
  if (!sessions.visible) return null;
  if (sessions.sessions.length === 0) {
    return (
      <CollectingCard
        kind="sessions"
        title={t('title')}
        status={tc('status')}
        body={tc('sessions.body')}
      />
    );
  }

  const tr = await getTranslations('ranking');
  const modeLabels = { retake: tr('modes.retake'), deathmatch: tr('modes.deathmatch') };

  return (
    <section
      data-testid="profile-sessions"
      className="v-panel v-panel-lg grid content-start gap-3 p-5 max-md:p-4"
    >
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{t('title')}</h3>
      <ul className="-mx-2 grid">
        {sessions.sessions.map((session) => (
          <SessionRow key={session.id} session={session} modeLabel={modeLabels[session.mode]} />
        ))}
      </ul>
    </section>
  );
}

async function SessionRow({ session, modeLabel }: { session: ProfileSession; modeLabel: string }) {
  const t = await getTranslations('profile.sessions');
  const format = await getFormatter();

  const maps = (session.maps.length > 0 ? session.maps : session.map ? [session.map] : [])
    .map((map) => mapDisplayName(map))
    .filter((name): name is string => name !== null);
  const title = maps.length > 0 ? maps.join(' → ') : t('noMap');
  const clock = (iso: string) =>
    format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', timeZone: BRASILIA });
  const day = format.dateTime(new Date(`${session.day}T12:00:00-03:00`), {
    day: 'numeric',
    month: 'short',
    timeZone: BRASILIA,
  });

  // A hora do relógio só vem para a própria Conta (nula para os outros).
  let when = day;
  if (session.startedAt) {
    when = session.live
      ? `${day}, ${t('since', { time: clock(session.startedAt) })}`
      : session.endedAt
        ? `${day}, ${t('range', { start: clock(session.startedAt), end: clock(session.endedAt) })}`
        : `${day}, ${clock(session.startedAt)}`;
  }

  return (
    <li
      data-testid={session.live ? 'session-live' : 'session'}
      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5"
    >
      <div className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-2 text-body-sm font-semibold">
          {session.live ? <StatusDot tone="online" pulse /> : null}
          <span className="truncate">
            {modeLabel} · {title}
          </span>
        </span>
        {session.live ? (
          <span className="text-caption text-muted-foreground">
            {session.server ? (
              <>
                {t('liveAt')}{' '}
                <Link
                  href={`/servers/${session.server.id}` as Route}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {session.server.name}
                  {session.server.code ? ` (${session.server.code})` : ''}
                </Link>
              </>
            ) : (
              t('live')
            )}
            {' · '}
            {when}
          </span>
        ) : (
          <span className="text-caption text-muted-foreground">{when}</span>
        )}
      </div>
      {session.live ? null : (
        <span className="shrink-0 text-body-sm tabular-nums text-muted-foreground">
          {session.seconds === null ? t('duration.none') : duration(t, session.seconds)}
        </span>
      )}
    </li>
  );
}

function duration(
  t: Awaited<ReturnType<typeof getTranslations<'profile.sessions'>>>,
  seconds: number,
): string {
  const time = playedParts(seconds);
  return time.hours > 0
    ? t('duration.hoursMinutes', time)
    : t('duration.minutes', { minutes: time.minutes });
}
