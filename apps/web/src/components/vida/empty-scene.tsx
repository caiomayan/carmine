import { cn } from '@/lib/utils';

/**
 * Estado vazio com cena em vez de caixa de texto: silhuetas de jogadores (amigos), de arma (Loadout e
 * Inventário vazios) ou de mapa. A arma vem da imagem de uma skin de verdade, escurecida até virar
 * silhueta, então o desenho é fiel ao jogo.
 */
export function EmptyScene({
  kind,
  weaponImage,
  mapSrc,
  className,
}: {
  kind: 'friends' | 'weapon' | 'map' | 'lock';
  weaponImage?: string;
  mapSrc?: string;
  className?: string;
}) {
  if (kind === 'lock') {
    return (
      <div aria-hidden="true" className={cn('relative mx-auto h-[92px] w-[190px]', className)}>
        <svg viewBox="0 0 190 92" className="absolute inset-0 size-full text-foreground">
          <title>Cadeado</title>
          <g fill="currentColor" opacity="0.14">
            <circle cx="42" cy="46" r="18" />
            <circle cx="148" cy="46" r="18" />
          </g>
          <rect x="68" y="40" width="54" height="40" rx="12" fill="currentColor" opacity="0.26" />
          <path
            d="M78 40V30a17 17 0 0 1 34 0v10"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            opacity="0.26"
          />
          <circle cx="95" cy="58" r="5" fill="var(--bg)" />
        </svg>
      </div>
    );
  }
  if (kind === 'friends') {
    return (
      <div aria-hidden="true" className={cn('relative mx-auto h-[92px] w-[190px]', className)}>
        <svg viewBox="0 0 190 92" className="absolute inset-0 size-full text-foreground">
          <title>Silhuetas de jogadores</title>
          <g fill="currentColor">
            <circle cx="95" cy="30" r="15" opacity="0.22" />
            <path d="M62 86c0-19 15-32 33-32s33 13 33 32z" opacity="0.22" />
            <circle cx="42" cy="40" r="11" opacity="0.12" />
            <path d="M18 86c0-14 11-24 24-24s24 10 24 24z" opacity="0.12" />
            <circle cx="148" cy="40" r="11" opacity="0.12" />
            <path d="M124 86c0-14 11-24 24-24s24 10 24 24z" opacity="0.12" />
          </g>
          <circle
            cx="95"
            cy="30"
            r="22"
            fill="none"
            stroke="var(--v-brand-hi)"
            strokeWidth="1.5"
            strokeDasharray="3 5"
            opacity="0.75"
          />
        </svg>
      </div>
    );
  }
  if (kind === 'weapon' && weaponImage) {
    return (
      <div aria-hidden="true" className={cn('relative mx-auto h-[110px] w-[260px]', className)}>
        {/* biome-ignore lint/performance/noImgElement: imagem externa da CDN */}
        <img
          src={weaponImage}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-contain opacity-[0.22] brightness-0 dark:invert"
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative mx-auto h-[110px] w-[240px] overflow-hidden rounded-2xl [mask-image:radial-gradient(closest-side,#000_40%,transparent)]',
        className,
      )}
    >
      {mapSrc ? (
        // biome-ignore lint/performance/noImgElement: arte local do mapa
        <img src={mapSrc} alt="" className="size-full object-cover opacity-60 grayscale" />
      ) : null}
    </div>
  );
}
