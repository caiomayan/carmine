'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/avatar';
import { OccupancyBar, STATE_TONE } from '@/components/servers/occupancy-bar';
import { useCopy } from '@/components/servers/use-copy';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { steamLoginHref } from '@/lib/auth-links';
import type { PlayView, PreviewServer } from '@/lib/header-previews/view';
import { steamConnectUrl } from '@/lib/live-servers';
import { mapDisplayName } from '@/lib/map-art';
import { BlockTitle, MapThumb, PanelFooterLink, rowLink, WithView } from './preview-parts';

/**
 * O painel "Jogar": o servidor recomendado (onde estão os amigos; senão o Modo que a pessoa mais
 * joga; senão o mais cheio), com Jogar e copiar o IP, e os outros no ar, cada um levando ao cartão
 * dele na home. Sem sessão, o mais cheio e "Entrar com a Steam".
 */
export function PlayPanel() {
  return <WithView>{(view) => <PlayContent play={view.play} signedIn={view.signedIn} />}</WithView>;
}

function PlayContent({ play, signedIn }: { play: PlayView; signedIn: boolean }) {
  const t = useTranslations('headerPreviews.play');
  const { recommended, others, friendsPlaying } = play;

  if (!recommended) {
    return (
      <div className="grid gap-1 p-3" data-testid="preview-play-empty">
        <p className="text-body-sm font-medium">{t('none')}</p>
        <p className="text-body-sm text-muted-foreground">{t('noneHint')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3" data-testid="preview-play">
      <Recommended server={recommended} />

      {others.length > 0 ? (
        <section className="grid gap-1" aria-label={t('others')}>
          <BlockTitle className="px-2.5">{t('others')}</BlockTitle>
          <ul className="grid">
            {others.map((server) => (
              <li key={server.id}>
                <OtherRow server={server} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        {signedIn ? (
          <p
            className="px-2.5 text-body-sm text-muted-foreground"
            data-testid="preview-friends-count"
          >
            {friendsPlaying === null ? '' : t('friendsPlaying', { count: friendsPlaying })}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3 px-1">
            <Button asChild size="sm">
              <a href={steamLoginHref('/')} data-testid="preview-sign-in">
                {t('signIn')}
              </a>
            </Button>
            <p className="text-body-sm text-muted-foreground">{t('signInHint')}</p>
          </div>
        )}
        <PanelFooterLink href="/">{t('all')}</PanelFooterLink>
      </div>
    </div>
  );
}

function Recommended({ server }: { server: PlayView['recommended'] & object }) {
  const t = useTranslations('headerPreviews');
  const { status, copy } = useCopy();
  const mapName = mapDisplayName(server.map);
  const full = server.state === 'full';

  return (
    <div className="grid gap-3 sm:grid-cols-[13rem_1fr]">
      <Link
        href={server.href}
        aria-label={server.name}
        className="relative block rounded-lg transition-opacity duration-(--dur-fast) ease-std hover:opacity-90"
        data-testid="preview-server-link"
      >
        <MapThumb map={server.map} />
        <span className="chip-solid absolute top-2 left-2 inline-flex items-center gap-2 text-caption font-medium">
          <StatusDot tone={STATE_TONE[server.state]} pulse={server.state === 'online'} />
          {full ? t('play.full') : t(`modes.${server.mode}`)}
        </span>
      </Link>

      <div className="grid content-between gap-3">
        <div className="grid gap-1">
          <BlockTitle>{t(`play.reasons.${server.reason}`)}</BlockTitle>
          <Link
            href={server.href}
            className="w-fit rounded-sm text-md font-semibold transition-opacity duration-(--dur-fast) ease-std hover:opacity-80"
          >
            {server.name}
          </Link>
          <p className="text-body-sm text-muted-foreground">
            {t(`modes.${server.mode}`)}
            {mapName ? ` · ${mapName}` : ''}
          </p>
        </div>

        <div className="grid gap-1.5">
          <OccupancyBar server={server} />
          <p className="text-body-sm tabular-nums">
            <span className="font-semibold">
              {t('play.players', { players: server.players, max: server.maxPlayers })}
            </span>
          </p>
        </div>

        {server.friends.length > 0 ? (
          <Link
            href={server.friends[0]?.href ?? '/'}
            className="flex min-w-0 items-center gap-2.5 rounded-lg p-1 -m-1 transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover)"
            data-testid="preview-friend"
          >
            <span className="flex -space-x-2">
              {server.friends.slice(0, 3).map((friend) => (
                <Avatar
                  key={friend.key}
                  src={friend.avatarUrl}
                  name={friend.name}
                  size={24}
                  className="ring-2 ring-popover"
                />
              ))}
            </span>
            <span className="truncate text-body-sm muted-on-fill">
              {server.friends[0]?.name}
              {server.friends.length > 1 ? ` +${server.friends.length - 1}` : ''}
            </span>
          </Link>
        ) : null}

        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <a
              href={steamConnectUrl(server.address)}
              aria-label={t('play.joinAria', { server: server.name })}
              data-testid="preview-join"
            >
              {t('play.join')}
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => copy(server.address)}
            aria-label={t('play.copyAria', { server: server.name })}
            data-testid="preview-copy"
          >
            {status === 'copied' ? (
              <CheckIcon aria-hidden="true" className="size-4" />
            ) : (
              <CopyIcon aria-hidden="true" className="size-4" />
            )}
            <span aria-live="polite">
              {status === 'copied' ? t('play.copied') : t('play.copy')}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function OtherRow({ server }: { server: PreviewServer }) {
  const t = useTranslations('headerPreviews');
  const mapName = mapDisplayName(server.map);
  return (
    <Link href={server.href} className={rowLink} data-testid="preview-other">
      <StatusDot tone={STATE_TONE[server.state]} />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-body-sm font-medium">{server.name}</span>
        <span className="truncate text-caption muted-on-fill">
          {t(`modes.${server.mode}`)}
          {mapName ? ` · ${mapName}` : ''}
        </span>
      </span>
      <span className="w-14 shrink-0 text-right text-body-sm tabular-nums">
        {server.state === 'full'
          ? t('play.full')
          : t('play.players', { players: server.players, max: server.maxPlayers })}
      </span>
    </Link>
  );
}
