'use client';

import type { LiveServer } from '@carmine/contracts';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { siSteam } from 'simple-icons';
import { BrandIcon } from '@/components/icons/brand-icon';
import { StatusDot } from '@/components/status-dot';
import { Ticker } from '@/components/vida/ticker';
import { signInHref } from '@/lib/auth-links';
import type { HomeState } from '@/lib/home/state';
import { type FriendOnServer, serverLabel, steamConnectUrl } from '@/lib/live-servers';
import { mapDisplayName } from '@/lib/map-art';
import { DISCORD_URL } from '@/lib/social';
import { DynamicButton } from './dynamic-button';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Os estados em que a Home tem servidores para mostrar (nos outros, ela mostra o carregando ou o aviso). */
export type HeroState = Extract<HomeState, 'offline' | 'deslogado' | 'amigos' | 'sem-nada'>;

/**
 * O topo da Home: "Ao vivo", o número gigante de jogadores no ar agora (que rola quando muda), o texto do estado
 * (deslogado, logado com amigos jogando, logado sem nada, servidores dormindo) e as duas ações. A ação principal é
 * a de maior valor para o estado: entrar com a Steam, jogar agora no servidor mais cheio (ou copiar o IP, no toque,
 * onde não há CS2) ou chamar a galera no Discord quando não há nada no ar.
 */
export function Hero({
  state,
  signedIn,
  total,
  liveCount,
  featured,
  friendsNow,
  hasLoadout,
  lastSeen,
  fromPath,
}: {
  state: HeroState;
  signedIn: boolean;
  total: number;
  liveCount: number;
  featured: LiveServer | null;
  friendsNow: FriendOnServer[];
  hasLoadout: boolean;
  /** O último batimento de qualquer servidor (ISO), para o "último sinal há X" do estado dormindo. */
  lastSeen: string | null;
  fromPath: string;
}) {
  const t = useTranslations('home.hero');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const asleep = state === 'offline';

  return (
    <div className="pt-14 max-md:pt-9" data-testid="home-hero">
      <p className="v-label inline-flex items-center gap-2.5 rounded-sm bg-(--bg)/70 px-3 py-2">
        <StatusDot tone={asleep ? 'offline' : 'online'} pulse={!asleep} />
        <span className={asleep ? 'text-muted-foreground' : 'vh-shine'}>
          {asleep ? t('paused') : t('live')}
        </span>
        <span aria-hidden="true" className="h-3 w-px bg-(--line-strong) max-md:hidden" />
        <span className="v-sign text-[17px] text-muted-foreground">
          <span className="md:hidden">· </span>
          {t('brand')}
          <span className="max-md:hidden"> · {t('tagline')}</span>
        </span>
      </p>

      {asleep ? (
        <h1 className="v-serif mt-5 max-w-[13ch] text-[clamp(54px,7.8vw,116px)] text-balance">
          {t('asleep')}
        </h1>
      ) : (
        <h1 className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-1">
          <span className="v-serif text-[clamp(120px,16vw,220px)]" data-testid="home-total">
            <Ticker value={total} />
          </span>
          <span className="pb-[1vw] text-[clamp(24px,2.7vw,38px)] leading-[1.05] font-semibold tracking-[-0.03em] max-md:pb-1">
            {t('players', { count: total })}
            <br />
            {t('onAir')}
          </span>
        </h1>
      )}

      <p
        className="mt-6 max-w-[52ch] text-md text-foreground/85"
        data-testid="home-lead"
        suppressHydrationWarning
      >
        {asleep
          ? lastSeen
            ? t('asleepBody', { ago: format.relativeTime(new Date(lastSeen), now) })
            : t('asleepNever')
          : state === 'amigos'
            ? t.rich('friendsBody', {
                count: liveCount,
                name: friendsNow[0]?.friend.displayName ?? '',
                others: friendsNow.length - 1,
                b: (chunks) => <b className="font-semibold">{chunks}</b>,
              })
            : state === 'sem-nada'
              ? t(hasLoadout ? 'quietBody' : 'quietNoLoadout', { count: liveCount })
              : t('signedOutBody')}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3 max-md:flex-col max-md:items-stretch [&>*]:max-md:w-full">
        <Primary signedIn={signedIn} asleep={asleep} featured={featured} fromPath={fromPath} />
        <Secondary signedIn={signedIn} hasLoadout={hasLoadout} />
        {featured && !asleep ? (
          <span className="pl-1 text-caption text-muted-foreground max-md:pl-0">
            {t('fullest', { name: serverLabel(featured) })}
            {featured.map ? ` · ${mapDisplayName(featured.map) ?? ''}` : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Primary({
  signedIn,
  asleep,
  featured,
  fromPath,
}: {
  signedIn: boolean;
  asleep: boolean;
  featured: LiveServer | null;
  fromPath: string;
}) {
  const t = useTranslations('home.hero');
  const connect = useTranslations('servers.connect');
  if (!signedIn) {
    return (
      <Link
        href={signInHref(fromPath) as never}
        className="vh-cta"
        data-testid="home-cta"
        data-action="sign-in"
      >
        <BrandIcon icon={siSteam} size={19} />
        {t('signIn')}
      </Link>
    );
  }
  if (asleep || !featured) {
    return (
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="vh-cta"
        data-testid="home-cta"
        data-action="discord"
      >
        {t('discord')}
      </a>
    );
  }
  return (
    <>
      <DynamicButton
        idle={t('playNow')}
        loading={connect('opening')}
        href={steamConnectUrl(featured.address)}
        className="pointer-coarse:hidden"
        testId="home-cta"
      />
      <DynamicButton
        idle={connect('copy')}
        loading={connect('copying')}
        done={connect('copied')}
        onAction={() => copyText(featured.address)}
        className="hidden pointer-coarse:inline-flex"
        testId="home-cta-copy"
      />
    </>
  );
}

function Secondary({ signedIn, hasLoadout }: { signedIn: boolean; hasLoadout: boolean }) {
  const t = useTranslations('home.hero');
  return signedIn ? (
    <Link href="/loadout" className="vh-cta-quiet">
      {hasLoadout ? t('seeLoadout') : t('buildLoadout')}
    </Link>
  ) : (
    <a href="#jogar" className="vh-cta-quiet">
      {t('seeServers')}
    </a>
  );
}
