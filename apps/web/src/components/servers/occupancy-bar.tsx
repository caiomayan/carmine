import type { LiveServer } from '@carmine/contracts';
import type { StatusTone } from '@/components/status-dot';
import { occupancy } from '@/lib/live-servers';
import { cn } from '@/lib/utils';

/** O tom do ponto de estado de cada estado de servidor (o rótulo escrito vem sempre ao lado). */
export const STATE_TONE: Record<LiveServer['state'], StatusTone> = {
  online: 'online',
  full: 'warn',
  offline: 'offline',
};

/**
 * A barra fina de lotação, decorativa: os jogadores vêm escritos ao lado. Cheia vira listrada,
 * quase cheia ganha a cor de contexto de aviso.
 */
export function OccupancyBar({ server }: { server: LiveServer }) {
  const { ratio, level } = occupancy(server);
  return (
    <span aria-hidden="true" className="block h-[3px] overflow-hidden rounded-[2px] bg-line">
      <span
        className={cn(
          'block h-full origin-left rounded-[2px] transition-[transform,background-color] duration-(--dur-slow) ease-out motion-reduce:transition-none',
          level === 'full'
            ? 'bg-[repeating-linear-gradient(-45deg,var(--status-warn)_0_3px,color-mix(in_srgb,var(--status-warn)_35%,transparent)_3px_6px)]'
            : level === 'high'
              ? 'bg-status-warn'
              : 'bg-status-online',
        )}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </span>
  );
}
