import type { Profile } from '@carmine/contracts';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { siSteam } from 'simple-icons';
import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { BadgeAlertIcon } from '@/components/icons/animated/badge-alert';
import { BoxIcon } from '@/components/icons/animated/box';
import { ExternalLinkIcon } from '@/components/icons/animated/external-link';
import { LockIcon } from '@/components/icons/animated/lock';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { BrandIcon } from '@/components/icons/brand-icon';
import { ShowcaseGrid } from '@/components/loadout/showcase-grid';
import { SanctionBadges, SanctionHistory } from '@/components/moderation/profile-sanctions';
import { CollectingCard } from '@/components/profile/collecting-card';
import { PresenceChip } from '@/components/profile/presence-chip';
import { ProfileEmpty } from '@/components/profile/profile-empty';
import { ProfileStats } from '@/components/profile/profile-stats';
import { SectionTitle } from '@/components/section-title';
import { Button } from '@/components/ui/button';
import { ambientFor, type SkinPalette } from '@/components/vida/skin-ambient';
import { findPublicIdBySteamId } from '@/lib/api-base';
import {
  getProfile,
  getProfileSeries,
  getProfileStats,
  getServerSession,
  type ProfileResult,
  visitorIp,
} from '@/lib/api-server';
import { parseProfileSegment, steamLoginHref } from '@/lib/auth-links';
import { RARITIES } from '@/lib/catalog/types';
import { buildShowcase, type ShowcaseView } from '@/lib/loadout/build';
import { memberSinceLabel } from '@/lib/profile-identity';
import { NOINDEX, profileMetadata } from '@/lib/profile-metadata';
import { statsState } from '@/lib/profile-stats';
import { settingsHref } from '@/lib/settings-nav';
import { skinPalette } from '@/lib/skin-palette';
import { cn } from '@/lib/utils';
import './profile.css';

type Params = Promise<{ publicId: string }>;
type SearchParams = Promise<{ visitante?: string | string[] }>;

/**
 * O Perfil do segmento da URL. Um SteamID64 normalmente já foi redirecionado (301) pelo proxy;
 * se chegou aqui (o proxy não achou a API), redireciona daqui mesmo.
 */
async function loadProfile(
  segment: string,
): Promise<Exclude<ProfileResult, { status: 'not-found' }>> {
  const parsed = parseProfileSegment(segment);
  if (parsed.kind === 'invalid') notFound();
  if (parsed.kind === 'steamId') {
    const publicId = await findPublicIdBySteamId(parsed.steamId, await visitorIp());
    if (publicId === null) notFound();
    if (publicId === undefined) return { status: 'unavailable' };
    permanentRedirect(`/${publicId}` as Route);
  }
  const result = await getProfile(parsed.publicId);
  if (result.status === 'not-found') notFound();
  return result;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const result = await loadProfile((await params).publicId);
  if (result.status !== 'found') return { robots: NOINDEX };
  const { profile } = result;
  const t = await getTranslations('profile');
  return profileMetadata(profile, t('metaDescription', { name: profile.displayName }));
}

/**
 * A cor ambiente do Perfil vem do Item mais raro da vitrine (a paleta da skin, só no servidor); sem Item
 * equipado fica neutra, nunca num vermelho de reserva.
 */
function ambientOf(showcase: ShowcaseView[]): CSSProperties {
  const featured = [...showcase].sort(
    (a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity),
  )[0];
  const palette: SkinPalette = featured ? skinPalette(featured.itemId) : null;
  const [first, second, third] = ambientFor(
    palette,
    featured ? `var(--rarity-${featured.rarity})` : null,
    'var(--muted)',
  );
  return { '--amb-1': first, '--amb-2': second, '--amb-3': third } as CSSProperties;
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const result = await loadProfile((await params).publicId);
  const t = await getTranslations('profile');

  if (result.status === 'unavailable') {
    return (
      <div className="container-page animate-fade-up py-12">
        <div className="v-panel v-panel-lg">
          <EmptyState
            icon={BadgeAlertIcon}
            title={t('unavailable.title')}
            body={t('unavailable.body')}
          />
        </div>
      </div>
    );
  }

  const { profile } = result;
  const server = await getServerSession();
  const viewer = server.status === 'authenticated' ? server.session.account : null;
  const owns = viewer?.publicId === profile.publicId;
  // "Ver como visitante": o dono confere o Perfil como os outros o veem (`?visitante=1`).
  const asVisitor = owns && (await searchParams).visitante === '1';
  const isOwner = owns && !asVisitor;
  // Não dá para saber se um visitante sem sessão é o dono: o convite é uma pergunta.
  const invite = !profile.claimed && server.status !== 'authenticated';
  const showcase = buildShowcase(profile.loadoutShowcase.items);
  const tc = await getTranslations('catalog');
  // As bolinhas CT/TR da vitrine são de cliente: só as mensagens delas vão ao navegador.
  const { common } = await getMessages();
  const [stats, series] = await Promise.all([
    getProfileStats(profile.publicId),
    getProfileSeries(profile.publicId),
  ]);
  // Sem Itens equipados nem jogos: um bloco só no lugar das duas caixas vazias.
  const bare = showcase.length === 0 && statsState(stats) === 'empty';
  const palettes = Object.fromEntries(showcase.map((item) => [item.key, skinPalette(item.itemId)]));

  return (
    <div
      data-vida="on"
      data-pf-quiet={bare || !profile.claimed ? '' : undefined}
      style={ambientOf(showcase)}
      className="relative"
    >
      <div aria-hidden="true" className="v-ambient">
        <i />
        <i />
        <i />
      </div>
      <div aria-hidden="true" className="pf-banner" data-testid="profile-banner" />

      <div className="container-page pb-24">
        <ProfileHeader profile={profile} isOwner={isOwner} asVisitor={asVisitor} />

        {invite ? <ClaimInvite profile={profile} /> : null}

        {bare ? (
          <ProfileEmpty name={profile.displayName} isOwner={isOwner} />
        ) : (
          <div className="mt-10 grid gap-x-10 gap-y-8 min-[1280px]:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid min-w-0 content-start gap-8">
              <div className="animate-fade-up [animation-delay:80ms]">
                <ProfileStats
                  stats={stats}
                  series={series?.visible ? series : null}
                  name={profile.displayName}
                  isOwner={isOwner}
                  isPrivate={profile.isPrivate}
                />
              </div>

              <section
                aria-labelledby="loadout"
                className="v-panel v-panel-lg animate-fade-up p-5 max-md:p-4 [animation-delay:120ms]"
              >
                <SectionTitle
                  id="loadout"
                  aside={
                    isOwner ? (
                      <Button asChild variant="quiet" size="sm" className="-my-1">
                        <Link href="/loadout">{t('loadout.toLoadout')}</Link>
                      </Button>
                    ) : null
                  }
                >
                  {t('loadout.title')}
                </SectionTitle>
                {showcase.length > 0 ? (
                  <div data-testid="loadout-showcase">
                    <NextIntlClientProvider messages={{ common: { team: common.team } }}>
                      <ShowcaseGrid
                        items={showcase}
                        palettes={palettes}
                        rarityLabels={Object.fromEntries(
                          RARITIES.map((r) => [r, tc(`rarities.${r}`)]),
                        )}
                      />
                    </NextIntlClientProvider>
                  </div>
                ) : (
                  <div data-testid="loadout-showcase">
                    <EmptyState
                      icon={BoxIcon}
                      title={t('loadout.emptyTitle')}
                      body={
                        isOwner
                          ? t('loadout.emptyOwner')
                          : t('loadout.emptyVisitor', { name: profile.displayName })
                      }
                      action={
                        isOwner ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href="/inventario">{t('loadout.toInventory')}</Link>
                          </Button>
                        ) : null
                      }
                    />
                  </div>
                )}
              </section>
            </div>

            {profile.isPrivate && !isOwner ? null : <Activity />}
          </div>
        )}

        <SanctionHistory sanctions={profile.sanctions} />
      </div>
    </div>
  );
}

/** A coluna da direita: as Sessões de jogo, que ainda não são registradas (S12b). */
async function Activity() {
  const t = await getTranslations('profile.stats.collecting');
  return (
    <aside className="grid content-start gap-4" aria-label={t('asideLabel')}>
      <CollectingCard
        kind="sessions"
        title={t('sessions.title')}
        status={t('status')}
        body={t('sessions.body')}
      />
    </aside>
  );
}

async function ProfileHeader({
  profile,
  isOwner,
  asVisitor,
}: {
  profile: Profile;
  isOwner: boolean;
  asVisitor: boolean;
}) {
  const t = await getTranslations('profile');
  // O "Entrar junto" é de cliente (abre o `steam://connect` e a instrução do console): só as mensagens dele vão ao navegador.
  const { servers } = await getMessages();
  const unclaimed = !profile.claimed;

  return (
    <header
      data-claimed={profile.claimed}
      className="pf-head flex animate-fade-up flex-wrap items-end gap-x-6 gap-y-4"
    >
      <Avatar
        src={profile.avatarUrl}
        name={profile.displayName}
        size={148}
        alt={t('avatarAlt', { name: profile.displayName })}
        className={cn(
          'pf-avatar max-md:[--avatar-size:104px]!',
          // Sinal de Conta não reivindicada: o avatar fica mais quieto, num fundo mais leve e com as
          // iniciais em secundário (sem contorno nem opacidade, que desbotavam as letras). Discreto
          // de propósito; nunca um selo (nada aqui parece "verificado"). A nota ao lado explica.
          unclaimed && 'bg-(--fill-rest) text-muted-foreground grayscale-[0.4]',
        )}
      />
      <div className="grid min-w-0 flex-1 gap-2.5 pb-1">
        <h1 className="v-serif text-[clamp(40px,6vw,84px)] break-words">{profile.displayName}</h1>
        <div className="flex flex-wrap items-center gap-2 text-caption font-semibold">
          {profile.isPrivate ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-(--fill-rest) px-3 py-1.5"
              data-testid="private-note"
            >
              <AnimatedIcon icon={LockIcon} size={13} />
              {t('privateSeal')}
            </span>
          ) : null}
          {profile.isVip ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-(--fill-rest) px-3 py-1.5 text-status-vip"
              data-testid="profile-vip"
            >
              <span aria-hidden="true" className="size-1.5 shrink-0 rotate-45 bg-status-vip" />
              {t('vip')}
            </span>
          ) : null}
          <NextIntlClientProvider
            messages={{
              servers: { connect: servers.connect, row: { fullHint: servers.row.fullHint } },
            }}
          >
            <PresenceChip
              publicId={profile.publicId}
              label={t('presence')}
              join={
                isOwner
                  ? undefined
                  : {
                      label: t('join'),
                      aria: t('joinAria', { name: profile.displayName }),
                    }
              }
            />
          </NextIntlClientProvider>
          <SanctionBadges active={profile.sanctions.active} />
        </div>
        <p
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-muted-foreground"
          data-testid="profile-identity"
        >
          <span data-testid="profile-public-id" className="tabular-nums">
            {t('publicId', { id: String(profile.publicId) })}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={profile.memberSince} data-testid="member-since">
            {t('memberSince', { date: memberSinceLabel(profile.memberSince) })}
          </time>
        </p>
        {unclaimed && !isOwner ? (
          <p className="text-body-sm text-muted-foreground" data-testid="unclaimed-note">
            {t('unclaimed')}
          </p>
        ) : null}
        {asVisitor ? (
          <p
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground"
            data-testid="as-visitor-note"
          >
            {t('asVisitorNote')}
            <Button asChild variant="quiet" size="sm">
              <Link href={`/${profile.publicId}` as Route}>{t('backToOwner')}</Link>
            </Button>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 pb-1 max-md:w-full">
        <a
          href={profile.steamProfileUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('steamLinkLabel', { name: profile.displayName })}
          className="inline-flex min-h-(--tap) items-center gap-2 rounded-full bg-(--fill-active) px-4 text-body-sm font-semibold transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-focus) max-md:flex-1 max-md:justify-center"
        >
          <BrandIcon icon={siSteam} size={14} />
          {t('steamLink')}
          <AnimatedIcon icon={ExternalLinkIcon} size={13} />
        </a>
        {isOwner ? (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={settingsHref('perfil') as Route} data-testid="edit-profile">
                {t('editProfile')}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link
                href={`/${profile.publicId}?visitante=1` as Route}
                data-testid="view-as-visitor"
              >
                {t('viewAsVisitor')}
              </Link>
            </Button>
          </>
        ) : null}
      </div>
    </header>
  );
}

async function ClaimInvite({ profile }: { profile: Profile }) {
  const t = await getTranslations('profile.claimInvite');
  return (
    <aside
      aria-labelledby="convite"
      data-testid="claim-invite"
      className="v-panel v-panel-lg mt-8 flex animate-fade-up flex-wrap items-center justify-between gap-x-6 gap-y-4 px-6 py-5 [animation-delay:40ms] max-md:px-5"
    >
      <div className="grid max-w-[60ch] gap-1">
        <h2 id="convite" className="text-md font-semibold">
          {t('title')}
        </h2>
        <p className="text-body-sm text-muted-foreground">{t('body')}</p>
      </div>
      <Button asChild size="sm" className="max-md:w-full">
        <a href={steamLoginHref(`/${profile.publicId}`)}>
          <BrandIcon icon={siSteam} size={15} />
          {t('action')}
        </a>
      </Button>
    </aside>
  );
}
