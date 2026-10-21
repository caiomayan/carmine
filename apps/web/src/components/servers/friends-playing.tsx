'use client';

import type { LiveServer } from '@carmine/contracts';
import { AnimatePresence, m } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type CSSProperties, type ReactNode, useId, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { CheckIcon } from '@/components/icons/animated/check';
import { CopyIcon } from '@/components/icons/animated/copy';
import { ExternalLinkIcon } from '@/components/icons/animated/external-link';
import { LockIcon } from '@/components/icons/animated/lock';
import { RefreshCWIcon } from '@/components/icons/animated/refresh-cw';
import { UsersIcon } from '@/components/icons/animated/users';
import { AnimatedIcon, type AnimatedIconComponent } from '@/components/icons/animated-icon';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { signInHref } from '@/lib/auth-links';
import {
  type FriendOnServer,
  friendsWithServers,
  serverFullLabel,
  steamConnectUrl,
} from '@/lib/live-servers';
import { mapDisplayName } from '@/lib/map-art';
import { cn } from '@/lib/utils';
import { useCopy } from './use-copy';
import type { FriendsPlayingState } from './use-friends-playing';

/** Onde a Steam guarda a privacidade da lista de amigos (a pessoa já está logada lá). */
const STEAM_PRIVACY_URL = 'https://steamcommunity.com/my/edit/settings';

const SKELETON = ['f-1', 'f-2', 'f-3'];

/** Quantos amigos aparecem antes do "Ver todos": o bloco não empurra a página. */
const VISIBLE_FRIENDS = 6;

/**
 * "Seus amigos jogando agora" (S06): os amigos Steam da Conta que estão num Servidor Carmine,
 * com "Entrar" no mesmo servidor. Três estados distintos além da lista: nenhum amigo jogando,
 * lista de amigos privada (com a orientação opcional e a consequência de privacidade) e Steam
 * indisponível. Sem sessão, um convite para entrar.
 */
export function FriendsPlaying({
  servers,
  friends: { view, refresh },
}: {
  servers: LiveServer[];
  friends: FriendsPlayingState;
}) {
  const t = useTranslations('servers.friends');
  const titleId = useId();
  const playing = view.status === 'ok' ? friendsWithServers(view.friends, servers) : [];
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hidden = Math.max(0, playing.length - VISIBLE_FRIENDS);
  const shown = expanded ? playing : playing.slice(0, VISIBLE_FRIENDS);

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={view.status === 'loading'}
      data-testid="friends-playing"
      data-status={view.status}
      className="rounded-xl bg-surface p-1.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 pt-3 pb-2.5">
        <h2
          id={titleId}
          className="inline-flex items-center gap-2.5 label-caps text-[11px] tracking-[0.14em] text-foreground"
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 rotate-45 bg-foreground" />
          {t('title')}
        </h2>
        {playing.length > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-surface-2 px-1.5 py-[3px] label-caps text-[9.5px] text-foreground">
            <StatusDot tone="online" />
            {t('count', { count: playing.length })}
          </span>
        ) : null}
      </div>

      {view.status === 'loading' ? (
        <div>
          <p className="sr-only" role="status">
            {t('loading')}
          </p>
          <ul aria-hidden="true">
            {SKELETON.map((id) => (
              <li key={id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="size-9 shrink-0 rounded-full shimmer" />
                <span className="grid flex-1 gap-1.5">
                  <span className="h-[12px] w-[60%] rounded-sm shimmer" />
                  <span className="h-[10px] w-[80%] rounded-sm shimmer" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : view.status === 'anonymous' ? (
        <Anonymous />
      ) : view.status === 'private' ? (
        <PrivateList />
      ) : view.status === 'unavailable' ? (
        <Notice icon={RefreshCWIcon} title={t('unavailable.title')} body={t('unavailable.body')}>
          <Button variant="ghost" size="sm" className="-ml-3" onClick={refresh}>
            <AnimatedIcon icon={RefreshCWIcon} size={15} />
            {t('unavailable.retry')}
          </Button>
        </Notice>
      ) : playing.length === 0 ? (
        <Notice icon={UsersIcon} title={t('none.title')} body={t('none.body')} />
      ) : (
        <>
          <ul id={listId} className="grid sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((entry, i) => (
              <FriendRow key={entry.friend.steamId} entry={entry} index={i} />
            ))}
          </ul>
          {hidden > 0 ? (
            <Button
              variant="quiet"
              size="sm"
              className="mx-1.5 mb-1"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? t('showLess') : t('showAll', { count: hidden })}
            </Button>
          ) : null}
          {view.stale ? (
            <p role="status" className="px-3 pt-1 pb-2.5 text-[12px] text-muted-foreground">
              {t('unavailable.stale')}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function FriendRow({ entry, index }: { entry: FriendOnServer; index: number }) {
  const t = useTranslations('servers.friends');
  const { friend, server, joinable } = entry;
  const { status: copyStatus, copy } = useCopy();
  const where = server
    ? server.state === 'offline'
      ? t('serverOffline')
      : t('on', { server: serverFullLabel(server), map: mapDisplayName(server.map) ?? '' })
    : t('serverUnknown');

  return (
    <li
      data-testid="friend-row"
      data-friend={friend.steamId}
      style={{ '--i': index } as CSSProperties}
      className="relative flex enter-stagger items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-(--dur-fast) ease-std hover:bg-surface-2"
    >
      <span className="relative shrink-0">
        <Avatar src={friend.avatarUrl} name={friend.displayName} size={36} />
        <span className="absolute -right-px -bottom-px grid place-items-center rounded-full bg-surface p-[2px]">
          <StatusDot tone={joinable ? 'online' : 'offline'} />
        </span>
      </span>
      <span className="grid min-w-0 flex-1 gap-px">
        <Link
          href={`/${friend.publicId}`}
          aria-label={t('profile', { name: friend.displayName })}
          className="w-fit max-w-full truncate rounded-xs text-[13.5px] font-semibold underline-offset-4 outline-offset-4 after:absolute after:inset-0 after:rounded-lg hover:underline"
        >
          {friend.displayName}
        </Link>
        <span className="truncate text-[12px] text-muted-foreground">{where}</span>
      </span>
      {joinable && server ? (
        <>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="relative z-10 shrink-0 pointer-coarse:hidden"
          >
            <a
              href={steamConnectUrl(server.address)}
              aria-label={t('joinAria', { name: friend.displayName })}
            >
              {t('join')}
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('copyAria', { name: friend.displayName })}
            onClick={() => copy(server.address)}
            className="relative z-10 hidden shrink-0 pointer-coarse:inline-flex"
          >
            {copyStatus === 'copied' ? (
              <span className="text-status-success">
                <AnimatedIcon icon={CheckIcon} size={16} />
              </span>
            ) : (
              <AnimatedIcon icon={CopyIcon} size={16} />
            )}
          </Button>
        </>
      ) : null}
    </li>
  );
}

/** Um estado do bloco sem lista: ícone num disco, o fato e a explicação. */
function Notice({
  icon,
  title,
  body,
  children,
}: {
  icon: AnimatedIconComponent;
  title: ReactNode;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div data-icon-trigger className="grid gap-1.5 px-3 pt-1 pb-3.5 animate-fade-up">
      <span className="mb-1.5 grid size-9 place-items-center rounded-full bg-surface-2 text-foreground">
        <AnimatedIcon icon={icon} size={17} />
      </span>
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="text-[13px] leading-[1.5] text-muted-foreground">{body}</p>
      {children ? <div className="pt-1.5">{children}</div> : null}
    </div>
  );
}

function PrivateList() {
  const t = useTranslations('servers.friends.private');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <Notice icon={LockIcon} title={t('title')} body={t('body')}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {t('howTo')}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={cn(
            'size-3.5 transition-transform duration-(--dur-base) ease-out motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </Button>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            key="how"
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-2.5 pt-2 text-[13px] leading-[1.5]">
              <ol className="grid list-decimal gap-1 pl-5 marker:text-muted-foreground">
                <li>{t('step1')}</li>
                <li>{t('step2')}</li>
              </ol>
              <p className="rounded-md bg-surface-2 px-3 py-2.5 text-muted-foreground">
                {t('consequence')}
              </p>
              <a
                href={STEAM_PRIVACY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 rounded-xs font-semibold underline-offset-4 hover:underline"
              >
                {t('open')}
                <AnimatedIcon icon={ExternalLinkIcon} size={14} />
              </a>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </Notice>
  );
}

function Anonymous() {
  const t = useTranslations('servers.friends.anonymous');
  const pathname = usePathname();
  return (
    <Notice icon={UsersIcon} title={t('title')} body={t('body')}>
      <Button asChild size="sm">
        <Link href={signInHref(pathname) as never}>{t('cta')}</Link>
      </Button>
    </Notice>
  );
}
