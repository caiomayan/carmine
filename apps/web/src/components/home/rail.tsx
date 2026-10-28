'use client';

import type { LiveServer } from '@carmine/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { type CSSProperties, type ReactNode, useEffect, useId, useState } from 'react';
import { CheckIcon } from '@/components/icons/animated/check';
import { CopyIcon } from '@/components/icons/animated/copy';
import { ExternalLinkIcon } from '@/components/icons/animated/external-link';
import { LockIcon } from '@/components/icons/animated/lock';
import { RefreshCWIcon } from '@/components/icons/animated/refresh-cw';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { useCopy } from '@/components/servers/use-copy';
import type { FriendsPlayingState } from '@/components/servers/use-friends-playing';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { Ticker } from '@/components/vida/ticker';
import type { ActivityItemView } from '@/lib/activity/view';
import { signInHref } from '@/lib/auth-links';
import type { TopByMode } from '@/lib/home/top';
import {
  type FriendOnServer,
  friendsWithServers,
  serverFullLabel,
  steamConnectUrl,
  viewFriends,
} from '@/lib/live-servers';
import { mapDisplayName } from '@/lib/map-art';
import { MODES, type Mode } from '@/lib/modes';
import { rankingHref } from '@/lib/ranking';
import { cn } from '@/lib/utils';
import { ActivityText } from './activity-text';
import { DynamicButton } from './dynamic-button';
import { EmptyScene } from './empty-scene';
import { PlayerAvatar } from './player-avatar';

/** Onde a Steam guarda a privacidade da lista de amigos (a pessoa já está logada lá). */
const STEAM_PRIVACY_URL = 'https://steamcommunity.com/my/edit/settings';

/** Painel do trilho: título com o ◆ branco, apoio opcional e o conteúdo. */
export function Panel({
  title,
  aside,
  children,
  className,
  testId,
  status,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
  status?: string;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-testid={testId}
      data-status={status}
      className={cn('v-panel v-panel-lg v-spot overflow-hidden p-5 max-md:p-4', className)}
    >
      <header className="flex items-center justify-between gap-3 pb-3.5">
        <h2
          id={titleId}
          className="inline-flex items-center gap-2.5 label-caps whitespace-nowrap text-foreground"
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 rotate-45 bg-foreground" />
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ amigos */

const SKELETON = ['f-1', 'f-2', 'f-3'];

/** Quantos amigos aparecem antes do "Ver mais": o trilho não empurra a página. */
const VISIBLE_FRIENDS = 4;

/**
 * "Seus amigos jogando agora" (S06) no trilho: os amigos Steam da Conta que estão num Servidor Carmine, com
 * "Jogar junto" no mesmo servidor. Além da lista: nenhum amigo jogando, lista de amigos privada (com os achados pelas
 * listas de quem joga e a orientação opcional), Steam indisponível e, sem sessão, o convite para entrar.
 */
export function FriendsPanel({
  servers,
  friends: { view, refresh },
  className,
}: {
  servers: LiveServer[];
  friends: FriendsPlayingState;
  className?: string;
}) {
  const t = useTranslations('servers.friends');
  const playing = friendsWithServers(viewFriends(view), servers);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hidden = Math.max(0, playing.length - VISIBLE_FRIENDS);
  const shown = expanded ? playing : playing.slice(0, VISIBLE_FRIENDS);

  return (
    <Panel
      testId="friends-playing"
      status={view.status}
      className={className}
      title={t('title')}
      aside={
        playing.length > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-(--fill-active) px-2.5 py-1 text-caption font-bold tabular-nums">
            <StatusDot tone="online" />
            {t('count', { count: playing.length })}
          </span>
        ) : null
      }
    >
      {view.status === 'loading' ? (
        <div aria-busy="true">
          <p className="sr-only" role="status">
            {t('loading')}
          </p>
          <ul aria-hidden="true" className="grid gap-1">
            {SKELETON.map((id) => (
              <li key={id} className="flex items-center gap-3 p-1.5">
                <span className="vh-skel size-10 shrink-0 rounded-full" />
                <span className="grid flex-1 gap-1.5">
                  <span className="vh-skel h-3 w-3/5 rounded-full" />
                  <span className="vh-skel h-2.5 w-4/5 rounded-full" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : view.status === 'anonymous' ? (
        <Anonymous />
      ) : view.status === 'private' && playing.length === 0 ? (
        <PrivateList found={false} />
      ) : view.status === 'unavailable' ? (
        <Notice title={t('unavailable.title')} body={t('unavailable.body')}>
          <Button variant="ghost" size="sm" onClick={refresh}>
            <AnimatedIcon icon={RefreshCWIcon} size={15} />
            {t('unavailable.retry')}
          </Button>
        </Notice>
      ) : playing.length === 0 ? (
        <Notice title={t('none.title')} body={t('none.body')} scene />
      ) : (
        <>
          <ul id={listId} className="grid gap-1">
            {shown.map((entry, i) => (
              <FriendRow key={entry.friend.steamId} entry={entry} index={i} />
            ))}
          </ul>
          {hidden > 0 ? (
            <Button
              variant="quiet"
              size="sm"
              className="mt-1 w-full"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? t('showLess') : t('showAll', { count: hidden })}
            </Button>
          ) : null}
          {view.status === 'private' ? <PrivateList found /> : null}
          {'stale' in view && view.stale ? (
            <p role="status" className="pt-2 text-caption text-muted-foreground">
              {t('unavailable.stale')}
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function FriendRow({ entry, index }: { entry: FriendOnServer; index: number }) {
  const t = useTranslations('servers.friends');
  const connect = useTranslations('servers.connect');
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
      className="enter-stagger v-inner relative flex items-center gap-3 p-1.5 transition-colors duration-(--dur-fast) hover:bg-(--fill-hover) has-focus-visible:bg-(--fill-hover)"
    >
      <PlayerAvatar src={friend.avatarUrl} name={friend.displayName} size={40} playing={joinable} />
      <span className="grid min-w-0 flex-1">
        <Link
          href={`/${friend.publicId}`}
          aria-label={t('profile', { name: friend.displayName })}
          className="w-fit max-w-full truncate rounded-xs text-body font-semibold underline-offset-4 outline-offset-4 after:absolute after:inset-0 after:rounded-[inherit] hover:underline"
        >
          {friend.displayName}
        </Link>
        <span className="truncate text-caption text-muted-foreground">{where}</span>
      </span>
      {joinable && server ? (
        <>
          <DynamicButton
            variant="quiet"
            idle={t('join')}
            loading={connect('opening')}
            href={steamConnectUrl(server.address)}
            ariaLabel={t('joinAria', { name: friend.displayName })}
            className="vh-pill relative z-10 min-h-9! px-3.5! text-[14px]! pointer-coarse:hidden"
          />
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

/** Um estado do painel sem lista: a cena (ou um ícone), o fato e a explicação. */
function Notice({
  title,
  body,
  scene = false,
  children,
}: {
  title: ReactNode;
  body: ReactNode;
  scene?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn('grid gap-2 py-1', scene && 'justify-items-center text-center')}>
      {scene ? <EmptyScene /> : null}
      <p className="text-md font-semibold">{title}</p>
      <p className="max-w-[40ch] text-body-sm text-muted-foreground">{body}</p>
      {children ? <div className="pt-1">{children}</div> : null}
    </div>
  );
}

/**
 * A lista de amigos da Conta é privada. Sem achados, é o estado do painel; com achados, vem discreta embaixo da
 * lista, só explicando que tornar a lista visível mostra todos.
 */
function PrivateList({ found }: { found: boolean }) {
  const t = useTranslations('servers.friends.private');
  return found ? (
    <div
      data-testid="friends-private-hint"
      className="grid gap-1 pt-2 text-caption leading-[1.5] text-muted-foreground"
    >
      <p>{t('foundBody')}</p>
      <PrivacyHowTo />
    </div>
  ) : (
    <Notice title={t('title')} body={t('body')}>
      <PrivacyHowTo />
    </Notice>
  );
}

/** "Como deixar a lista visível": os passos e a consequência de privacidade, sob demanda. */
function PrivacyHowTo() {
  const t = useTranslations('servers.friends.private');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <AnimatedIcon icon={LockIcon} size={14} />
        {t('howTo')}
      </Button>
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity,visibility] duration-(--dur-slow) ease-soft motion-reduce:transition-none',
          open ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        )}
      >
        <div id={panelId} className="min-h-0 overflow-hidden">
          <div className="grid gap-2.5 pt-2 text-body-sm leading-[1.5] text-foreground">
            <ol className="grid list-decimal gap-1 pl-5 marker:text-muted-foreground">
              <li>{t('step1')}</li>
              <li>{t('step2')}</li>
            </ol>
            <p className="rounded-xl bg-(--fill-rest) px-3 py-2.5 text-muted-foreground">
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
        </div>
      </div>
    </div>
  );
}

function Anonymous() {
  const t = useTranslations('servers.friends.anonymous');
  const pathname = usePathname();
  return (
    <Notice title={t('title')} body={t('body')} scene>
      <Link href={signInHref(pathname) as never} className="vh-cta-quiet">
        {t('cta')}
      </Link>
    </Notice>
  );
}

/* ------------------------------------------------------------------ atividade */

/** Quantos acontecimentos o trilho mostra. */
const FEED_ROWS = 5;

/**
 * A atividade dos servidores (#71) no trilho: o que acabou de acontecer, do mais novo para o mais antigo, com o
 * avatar, a frase e o "há X". Cada linha leva ao contexto (o servidor, o Ranking, o Perfil). O acontecimento que
 * chega abre empurrando os outros e pisca. Sem nenhum, o painel diz isso (a faixa de baixo de 1280 px é que some).
 */
export function FeedPanel({
  items,
  fresh,
  live,
  className,
}: {
  items: ActivityItemView[];
  fresh: ReadonlySet<string>;
  live: boolean;
  className?: string;
}) {
  const t = useTranslations('home.feed');
  return (
    <Panel
      testId="activity-feed"
      className={className}
      title={live ? t('titleLive') : t('titleRecent')}
      aside={
        live ? (
          <span className="inline-flex items-center gap-2 text-caption font-semibold text-muted-foreground">
            <StatusDot tone="online" pulse />
            {t('realtime')}
          </span>
        ) : null
      }
    >
      {items.length === 0 ? (
        <p className="py-2 text-body-sm text-muted-foreground" data-testid="activity-empty">
          {t('empty')}
        </p>
      ) : (
        <ul aria-label={t('listLabel')} className="grid">
          {items.slice(0, FEED_ROWS).map((item) => (
            <FeedRow key={item.id} item={item} isNew={fresh.has(item.id)} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FeedRow({ item, isNew }: { item: ActivityItemView; isNew: boolean }) {
  const [entering, setEntering] = useState(isNew);
  useEffect(() => {
    if (!isNew) return;
    // Dois quadros: o primeiro desenha a linha fechada, o segundo a abre.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntering(false));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [isNew]);

  return (
    <li
      data-testid="activity-item"
      data-kind={item.kind}
      data-new={entering ? '' : undefined}
      className="vh-feed-row"
    >
      <div>
        <Link
          href={item.href}
          prefetch={false}
          className={cn(
            'v-inner flex items-center gap-3 px-1.5 py-2 transition-colors duration-(--dur-fast) hover:bg-(--fill-hover)',
            isNew && 'vh-feed-flash',
          )}
        >
          <PlayerAvatar src={item.player.avatarUrl} name={item.player.name} size={34} />
          <span className="min-w-0 flex-1 text-body-sm text-muted-foreground">
            <ActivityText item={item} />
          </span>
          <Ago at={item.at} />
        </Link>
      </div>
    </li>
  );
}

/** "há 3 min", relido a cada 15 s (no servidor e na hidratação o texto é o mesmo, sem mismatch). */
function Ago({ at }: { at: string }) {
  const format = useFormatter();
  const now = useNow({ updateInterval: 15_000 });
  return (
    <time
      dateTime={at}
      suppressHydrationWarning
      className="shrink-0 text-caption text-faint tabular-nums"
    >
      {format.relativeTime(new Date(at), now)}
    </time>
  );
}

/* ------------------------------------------------------------------ top 3 */

/**
 * O Top 3 da semana (o Ranking de cada Modo): posição em display, avatar, nome e o número, que rola quando muda.
 * Perfil privado é "Jogador privado", sem link, como no Ranking. Sem ninguém, o painel diz que o Ranking ainda está
 * vazio; com a API fora, que não deu para carregar.
 */
export function TopPanel({ top, className }: { top: TopByMode | null; className?: string }) {
  const t = useTranslations('home.top');
  const tm = useTranslations('servers.modes');
  const [mode, setMode] = useState<Mode>('retake');
  const rows = top?.[mode] ?? [];
  return (
    <Panel testId="top3" className={className} title={t('title')}>
      {/* As abas moram numa fileira própria, abaixo do título: ao lado dele o título quebrava em 2 linhas. */}
      <fieldset className="m-0 mb-3 grid min-w-0 grid-cols-2 rounded-full border-0 bg-(--fill-rest) p-0.5">
        <legend className="sr-only">{t('modeLabel')}</legend>
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              'min-h-7 rounded-full px-3 text-caption font-semibold text-muted-foreground transition-colors duration-(--dur-fast) max-md:min-h-(--tap)',
              mode === m && 'bg-(--fill-active) text-foreground',
            )}
          >
            {tm(m)}
          </button>
        ))}
      </fieldset>
      {top === null ? (
        <p className="py-2 text-body-sm text-muted-foreground" data-testid="top3-unavailable">
          {t('unavailable')}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-2 text-body-sm text-muted-foreground" data-testid="top3-empty">
          {t('empty', { mode: tm(mode) })}
        </p>
      ) : (
        <ol className="grid gap-1">
          {rows.map((row, i) => {
            const content = (
              <>
                <span
                  className="v-sign w-8 text-center text-[40px]"
                  style={{ color: i === 0 ? 'var(--text)' : 'var(--muted)' }}
                >
                  {row.position}
                </span>
                <PlayerAvatar src={row.avatarUrl} name={row.name} size={34} />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-body font-semibold',
                    row.private && 'text-muted-foreground italic',
                  )}
                >
                  {row.name}
                </span>
                <Ticker
                  value={row.value}
                  decimals={row.decimals}
                  className="v-sign text-[30px] text-foreground"
                />
              </>
            );
            const rowClass =
              'v-inner flex items-center gap-3 p-1.5 transition-colors duration-(--dur-fast)';
            return (
              <li key={`${mode}-${row.position}`} data-testid="top3-row">
                {row.href ? (
                  <Link href={row.href} className={cn(rowClass, 'hover:bg-(--fill-hover)')}>
                    {content}
                  </Link>
                ) : (
                  <div className={rowClass}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-caption text-muted-foreground">{t(`unit.${mode}`)}</p>
        <Link
          href={rankingHref(mode) as never}
          className="inline-flex min-h-6 items-center text-caption font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {t('seeRanking')}
        </Link>
      </div>
    </Panel>
  );
}
