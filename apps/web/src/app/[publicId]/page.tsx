import type { Profile } from '@carmine/contracts';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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
import { ProfileEmpty } from '@/components/profile/profile-empty';
import { ProfileStats } from '@/components/profile/profile-stats';
import { SectionTitle } from '@/components/section-title';
import { Button } from '@/components/ui/button';
import { findPublicIdBySteamId } from '@/lib/api-base';
import {
  getProfile,
  getProfileStats,
  getServerSession,
  type ProfileResult,
  visitorIp,
} from '@/lib/api-server';
import { parseProfileSegment, steamLoginHref } from '@/lib/auth-links';
import { RARITIES } from '@/lib/catalog/types';
import { buildShowcase } from '@/lib/loadout/build';
import { NOINDEX, profileMetadata } from '@/lib/profile-metadata';
import { statsState } from '@/lib/profile-stats';
import { settingsHref } from '@/lib/settings-nav';
import { cn } from '@/lib/utils';

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
        <div className="rounded-xl bg-surface">
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
  const stats = await getProfileStats(profile.publicId);
  // Sem Itens equipados nem jogos: um bloco só no lugar das duas caixas vazias.
  const bare = showcase.length === 0 && statsState(stats) === 'empty';

  return (
    <div className="container-page pb-16">
      <ProfileHeader profile={profile} isOwner={isOwner} asVisitor={asVisitor} />

      {invite ? <ClaimInvite profile={profile} /> : null}

      {bare ? (
        <ProfileEmpty name={profile.displayName} isOwner={isOwner} />
      ) : (
        <>
          <ProfileStats
            stats={stats}
            name={profile.displayName}
            isOwner={isOwner}
            isPrivate={profile.isPrivate}
          />

          <section
            aria-labelledby="loadout"
            className="animate-fade-up pt-10 [animation-delay:120ms]"
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
                <ShowcaseGrid
                  items={showcase}
                  rarityLabels={Object.fromEntries(RARITIES.map((r) => [r, tc(`rarities.${r}`)]))}
                />
              </div>
            ) : (
              <div className="rounded-xl bg-surface" data-testid="loadout-showcase">
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
        </>
      )}

      <SanctionHistory sanctions={profile.sanctions} />
    </div>
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
  const unclaimed = !profile.claimed;

  return (
    <header
      data-claimed={profile.claimed}
      className="flex animate-fade-up items-center gap-6 pt-10 pb-2 max-md:items-start max-md:gap-4 max-md:pt-7"
    >
      <Avatar
        src={profile.avatarUrl}
        name={profile.displayName}
        size={96}
        alt={t('avatarAlt', { name: profile.displayName })}
        className={cn(
          'max-md:[--avatar-size:72px]!',
          // Sinal de Conta não reivindicada: o avatar fica mais quieto, num fundo mais leve e com as
          // iniciais em secundário (sem contorno nem opacidade, que desbotavam as letras). Discreto
          // de propósito; nunca um selo (nada aqui parece "verificado"). A nota ao lado explica.
          unclaimed && 'bg-(--fill-rest) text-muted-foreground grayscale-[0.4]',
        )}
      />
      <div className="grid min-w-0 gap-2">
        <h1 className="text-display break-words max-md:text-[26px]">{profile.displayName}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <a
            href={profile.steamProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('steamLinkLabel', { name: profile.displayName })}
            className="-mx-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 font-medium text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground max-md:min-h-(--tap)"
          >
            <BrandIcon icon={siSteam} size={14} />
            {t('steamLink')}
            <AnimatedIcon icon={ExternalLinkIcon} size={13} />
          </a>
        </div>
        <SanctionBadges active={profile.sanctions.active} />
        {profile.isPrivate ? (
          <p
            className="inline-flex items-center gap-2 text-body-sm text-muted-foreground"
            data-testid="private-note"
          >
            <AnimatedIcon icon={LockIcon} size={13} />
            {t('privateSeal')}
          </p>
        ) : null}
        {unclaimed && !isOwner ? (
          <p className="text-body-sm text-muted-foreground" data-testid="unclaimed-note">
            {t('unclaimed')}
          </p>
        ) : null}
        {isOwner ? (
          <div className="flex flex-wrap gap-2 pt-1">
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
          </div>
        ) : asVisitor ? (
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
    </header>
  );
}

async function ClaimInvite({ profile }: { profile: Profile }) {
  const t = await getTranslations('profile.claimInvite');
  return (
    <aside
      aria-labelledby="convite"
      data-testid="claim-invite"
      className="mt-6 flex animate-fade-up flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-xl bg-surface px-5 py-4 [animation-delay:40ms]"
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
