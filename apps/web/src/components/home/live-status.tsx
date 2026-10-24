'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { LiveCount } from '@/components/live-count';
import { StatusDot } from '@/components/status-dot';
import { type LiveState, updatedSecondsAgo } from '@/lib/live-servers';

/**
 * O "ao vivo" da lista: o ponto, os totais (que rolam quando mudam) e, com a conexão caída,
 * "Reconectando · atualizado há X s". Leitores de tela ouvem só a queda e a volta, não cada
 * segundo da contagem.
 */
export function LiveStatus({ state }: { state: LiveState }) {
  const t = useTranslations('servers.live');
  const seconds = useSecondsAgo(state);
  const connection = useShownConnection(state.connection);
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef(connection);

  useEffect(() => {
    if (previous.current === connection) return;
    if (connection === 'lost') setAnnouncement(t('lostAnnounce'));
    else if (connection === 'live' && previous.current === 'lost') {
      setAnnouncement(t('backAnnounce'));
    }
    previous.current = connection;
  }, [connection, t]);

  const summary = state.list?.summary;
  const strong = (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>;

  return (
    <div
      data-testid="live-status"
      data-connection={connection}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground"
    >
      <span className="inline-flex items-center gap-2 label-caps text-[11px] text-foreground">
        <StatusDot
          tone={connection === 'live' ? 'online' : connection === 'lost' ? 'warn' : 'offline'}
          pulse={connection === 'live'}
        />
        {t(connection)}
      </span>
      {connection === 'lost' && seconds !== null ? (
        <span data-testid="live-updated" className="tabular-nums">
          {t('updated', { seconds })}
        </span>
      ) : null}
      {summary ? (
        <span className="inline-flex flex-wrap gap-x-1.5 max-sm:basis-full">
          <span>
            {t.rich('servers', {
              count: summary.online,
              n: () => strong(<LiveCount value={summary.online} />),
            })}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.rich('players', {
              count: summary.players,
              n: () => strong(<LiveCount value={summary.players} />),
            })}
          </span>
        </span>
      ) : null}
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}

/** Os segundos do "atualizado há", relidos a cada segundo só enquanto a conexão está caída. */
function useSecondsAgo(state: LiveState): number | null {
  const [now, setNow] = useState(() => Date.now());
  const lost = state.connection === 'lost';
  useEffect(() => {
    if (!lost) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lost]);
  return updatedSecondsAgo(state, now);
}

/** Uma queda mais curta do que isso (o EventSource reconectando sozinho) não vira aviso. */
const LOST_GRACE_MS = 2000;

/**
 * A conexão como a tela mostra: a queda só aparece depois de {@link LOST_GRACE_MS}, para uma
 * reconexão normal (o túnel fechando um stream ocioso) não piscar "Reconectando".
 */
export function useShownConnection(connection: LiveState['connection']): LiveState['connection'] {
  const [shown, setShown] = useState(connection);
  useEffect(() => {
    if (connection !== 'lost') {
      setShown(connection);
      return;
    }
    const timer = setTimeout(() => setShown('lost'), LOST_GRACE_MS);
    return () => clearTimeout(timer);
  }, [connection]);
  return shown;
}
