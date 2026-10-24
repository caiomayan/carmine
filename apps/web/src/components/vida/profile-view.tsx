'use client';

import { type CSSProperties, useEffect, useState, ViewTransition } from 'react';
import { siSteam } from 'simple-icons';
import { BrandIcon } from '@/components/icons/brand-icon';
import { StatusDot } from '@/components/status-dot';
import { publishLiveSummary } from '@/lib/servers';
import { cn } from '@/lib/utils';
import {
  MAP_NAMES,
  type MapSlug,
  mapSrc,
  PEOPLE,
  type SkinInfo,
  skinColors,
} from './data';
import { EmptyScene } from './empty-scene';
import dynamic from 'next/dynamic';
import { setFooterMap } from './footer-fx';
import { MapPicture, mapPalette, useNight } from './map-art';
import { Face } from './face';
import { SkinCard } from './skin-card';
import { Ticker } from './ticker';

const ProfileCharts = dynamic(() => import('./profile-charts'), { ssr: false, loading: () => <div aria-hidden="true" className="v-skel h-[320px] rounded-xl" /> });
const ProfileSpark = dynamic(() => import('./profile-spark'), { ssr: false });

type Period = 'week' | 'total';

/** Tendência das últimas 8 semanas de cada número (exemplo). */
const TREND: Record<string, number[]> = {
  kd: [1.4, 1.5, 1.45, 1.6, 1.7, 1.5, 1.9, 1.84],
  kills: [260, 340, 300, 420, 390, 210, 450, 412],
  hs: [41, 43, 42, 45, 44, 40, 48, 47.2],
  hours: [9, 12, 11, 15, 14, 6, 17, 14.5],
};

const NUMBERS: Record<Period, { key: string; label: string; value: number; decimals: number; suffix: string }[]> = {
  week: [
    { key: 'kd', label: 'K/D', value: 1.84, decimals: 2, suffix: '' },
    { key: 'kills', label: 'abates', value: 412, decimals: 0, suffix: '' },
    { key: 'hs', label: 'na cabeça', value: 47.2, decimals: 1, suffix: '%' },
    { key: 'hours', label: 'horas jogadas', value: 14.5, decimals: 1, suffix: ' h' },
  ],
  total: [
    { key: 'kd', label: 'K/D', value: 1.52, decimals: 2, suffix: '' },
    { key: 'kills', label: 'abates', value: 9846, decimals: 0, suffix: '' },
    { key: 'hs', label: 'na cabeça', value: 43.8, decimals: 1, suffix: '%' },
    { key: 'hours', label: 'horas jogadas', value: 238, decimals: 0, suffix: ' h' },
  ],
};

const MODES: Record<Period, { mode: string; rows: [string, number, number, string][] }[]> = {
  week: [
    { mode: 'Retake', rows: [['rounds ganhos', 388, 0, ''], ['ADR', 94.7, 1, ''], ['K/D', 1.91, 2, '']] },
    { mode: 'Deathmatch', rows: [['abates por minuto', 2.12, 2, ''], ['na cabeça', 49.6, 1, '%'], ['K/D', 1.62, 2, '']] },
  ],
  total: [
    { mode: 'Retake', rows: [['rounds ganhos', 6920, 0, ''], ['ADR', 88.3, 1, ''], ['K/D', 1.58, 2, '']] },
    { mode: 'Deathmatch', rows: [['abates por minuto', 1.94, 2, ''], ['na cabeça', 42.1, 1, '%'], ['K/D', 1.44, 2, '']] },
  ],
};

const WEEKS = [210, 340, 295, 420, 380, 150, 460, 388];

const SESSIONS = [
  { where: 'Retake · Mirage', when: 'Agora', detail: 'em andamento', live: true },
  { where: 'Deathmatch · Dust2', when: 'Ontem', detail: '58 min', live: false },
  { where: 'Retake · Inferno', when: 'Ontem', detail: '1 h 24 min', live: false },
  { where: 'Retake · Mirage', when: 'Terça', detail: '42 min', live: false },
];

const SHOWCASE = [
  { skin: 1327, statTrak: false, sides: ['ct', 't'] as ('ct' | 't')[], meta: 'Nova de Fábrica 0,0121' },
  { skin: 222, statTrak: true, sides: ['t'] as ('ct' | 't')[], meta: 'Pouco Usada 0,0862' },
  { skin: 1099, statTrak: false, sides: ['ct'] as ('ct' | 't')[], meta: 'Nova de Fábrica 0,0301' },
  { skin: 306, statTrak: true, sides: ['ct'] as ('ct' | 't')[], meta: 'Pouco Usada 0,1044' },
  { skin: 171, statTrak: false, sides: ['t'] as ('ct' | 't')[], meta: 'Testada em Campo 0,2013' },
  { skin: 1717, statTrak: false, sides: ['ct', 't'] as ('ct' | 't')[], meta: 'Nova de Fábrica 0,0412' },
];

function Block({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('v-panel v-panel-lg v-spot p-5 max-md:p-4', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <h2 className="inline-flex items-center gap-2.5 label-caps text-foreground">
          <span aria-hidden="true" className="size-1.5 rotate-45 bg-(--v-brand)" />
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-full bg-(--fill-rest) p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'min-h-8 rounded-full px-3.5 text-caption font-semibold text-muted-foreground transition-colors duration-(--dur-fast) max-md:min-h-(--tap)',
            value === o.id && 'bg-(--fill-active) text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type ProfileEstado = 'completo' | 'novo' | 'privado' | 'nao-reivindicado';

const WHO: Record<ProfileEstado, { name: string; person: string; id: string }> = {
  completo: { name: 'lia.exe', person: 'lia', id: '1 337' },
  novo: { name: 'Cacau', person: 'cacau', id: '48 211' },
  privado: { name: 'Mafalda', person: 'mafalda', id: '2 904' },
  'nao-reivindicado': { name: 'Jão', person: 'jao', id: '51 007' },
};

export function ProfileView({
  estado,
  skins,
}: {
  estado: ProfileEstado;
  skins: Record<number, SkinInfo>;
}) {
  const fresh = estado === 'novo';
  const priv = estado === 'privado';
  const unclaimed = estado === 'nao-reivindicado';
  const playing = estado === 'completo' || priv;
  const showStats = estado === 'completo' || unclaimed;
  const hasLoadout = estado === 'completo' || priv;
  const { name, person: personId, id: publicId } = WHO[estado];
  const person = PEOPLE[personId];
  const topMap: MapSlug = 'mirage';
  const [period, setPeriod] = useState<Period>('week');
  const night = useNight();
  const [c1, c2, c3] = hasLoadout ? skinColors(1327) : mapPalette(topMap, night);
  useEffect(() => setFooterMap(topMap), []);
  useEffect(() => {
    publishLiveSummary({ online: 2, players: 19 } as Parameters<typeof publishLiveSummary>[0]);
  }, []);

  return (
    <div
      data-vida="on"
      data-map={topMap}
      data-state={estado}
      style={{ '--amb-1': c1, '--amb-2': c2, '--amb-3': c3 } as CSSProperties}
    >
      <div aria-hidden="true" className="v-ambient">
        <i />
        <i />
        <i />
      </div>

      {/* banner de borda a borda: a arte do mapa mais jogado */}
      <div
        className="relative h-[300px] w-screen overflow-hidden max-md:h-[210px]"
        style={{ marginInline: 'calc(50% - 50vw)' }}
        data-testid="vida-banner"
      >
        <MapPicture
          map={topMap}
          priority
          sizes="100vw"
          className="absolute inset-0"
          imgClassName={cn('v-map-img', (fresh || unclaimed) && 'grayscale-[0.7] brightness-75')}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, var(--bg) 0%, color-mix(in srgb, var(--bg) 70%, transparent) 45%, color-mix(in srgb, var(--bg) 18%, transparent) 100%)',
          }}
        />
        <span className="v-sign absolute right-6 bottom-4 hidden rounded-full bg-(--v-scrim)/70 px-3.5 py-2 text-[15px] text-foreground min-[760px]:block">
          {fresh
            ? 'Sem jogos ainda'
            : unclaimed
              ? 'Conta não reivindicada'
              : priv
                ? 'Perfil privado'
                : `Mapa mais jogado · ${MAP_NAMES[topMap]}`}
        </span>
      </div>

      <div className="container-page pb-24">
        <div className="relative -mt-[74px] flex flex-wrap items-end gap-x-6 gap-y-4 max-md:-mt-[52px]">
          <ViewTransition name={estado === 'completo' ? 'face-lia' : undefined} share="v-face">
            <Face
              name={name}
              hue={person?.hue ?? 330}
              size={148}
              live={playing}
              className={cn(
                'shrink-0 text-[56px]! ring-offset-[6px]! max-md:size-[104px]! max-md:text-[40px]!',
                unclaimed && 'opacity-60 grayscale-[0.6]',
              )}
            />
          </ViewTransition>
          <div className="grid min-w-0 flex-1 gap-2.5 pb-1">
            <h1 className="v-serif text-[clamp(48px,6vw,84px)] break-words" data-testid="vida-name">
              {name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-caption font-semibold">
              <span className="rounded-full bg-(--fill-rest) px-3 py-1.5 tabular-nums">ID público #{publicId}</span>
              {fresh ? <span className="rounded-full bg-(--fill-rest) px-3 py-1.5">Conta nova</span> : null}
              {unclaimed ? (
                <span className="rounded-full bg-(--fill-rest) px-3 py-1.5">Conta não reivindicada</span>
              ) : null}
              {priv ? (
                <span
                  data-testid="vida-private-seal"
                  className="inline-flex items-center gap-1.5 rounded-full bg-(--fill-rest) px-3 py-1.5"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="7" width="10" height="7" rx="2" />
                    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                  </svg>
                  Perfil privado
                </span>
              ) : null}
              {estado === 'completo' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-vip/25 px-3 py-1.5 text-foreground"><span aria-hidden="true" className="size-2 rounded-full bg-status-vip" />VIP</span>
              ) : null}
              {playing ? (
                <>
                  <span className="rounded-full bg-(--fill-rest) px-3 py-1.5">Membro desde jun/2026</span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-(--fill-rest) px-3 py-1.5">
                    <StatusDot tone="online" pulse />
                    Jogando agora · Retake em Mirage
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pb-1 max-md:w-full">
            {playing ? (
              <a href="#jogar" className="v-cta max-md:flex-1">
                Entrar junto
              </a>
            ) : null}
            <a
              href="https://steamcommunity.com/"
              className="v-cta-quiet max-md:flex-1"
              rel="noopener noreferrer"
              target="_blank"
            >
              <BrandIcon icon={siSteam} size={15} />
              Perfil na Steam
            </a>
          </div>
        </div>

        {unclaimed ? (
          <aside
            data-testid="vida-claim-invite"
            className="v-panel v-panel-lg mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 bg-surface px-7 py-5 max-md:px-5"
          >
            <div className="grid max-w-[60ch] gap-1">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">Esta Conta é sua?</h2>
              <p className="text-body-sm text-muted-foreground">
                {name} jogou nos Servidores Carmine, mas nunca entrou no site. Entre com a Steam para reivindicar este
                Perfil e montar o seu Loadout. É a mesma Conta, com as estatísticas que já existem.
              </p>
            </div>
            <a href="#entrar" className="v-cta max-md:w-full">
              <BrandIcon icon={siSteam} size={17} />
              Entrar com a Steam
            </a>
          </aside>
        ) : null}

        <div className="mt-10 grid gap-x-10 gap-y-8 min-[1280px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 content-start gap-8">
            <Block
              title="Estatísticas"
              aside={
                showStats ? (
                  <Toggle
                    label="Período"
                    value={period}
                    onChange={setPeriod}
                    options={[
                      { id: 'week', label: 'Esta semana' },
                      { id: 'total', label: 'Total' },
                    ]}
                  />
                ) : null
              }
            >
              {priv ? (
                <div className="grid justify-items-center gap-3 py-6 text-center" data-testid="vida-stats-private">
                  <EmptyScene kind="lock" />
                  <p className="text-md font-semibold">As estatísticas de {name} são privadas</p>
                  <p className="max-w-[46ch] text-body-sm text-muted-foreground">
                    Nome, avatar, Loadout e presença em servidor continuam públicos. Quem tem Perfil privado aparece no
                    Ranking como “Jogador privado”.
                  </p>
                </div>
              ) : fresh ? (
                <div className="grid justify-items-center gap-3 py-6 text-center" data-testid="vida-stats-empty">
                  <EmptyScene kind="map" mapSrc={mapSrc('dust2', 800)} />
                  <p className="text-md font-semibold">Nenhum round jogado ainda</p>
                  <p className="max-w-[44ch] text-body-sm text-muted-foreground">
                    As estatísticas aparecem depois do primeiro connect num Servidor Carmine. K/D, abates e HS% contam
                    por semana.
                  </p>
                  <a href="/proto" className="v-cta mt-1">
                    Ver os servidores
                  </a>
                </div>
              ) : (
                <div className="grid gap-8" data-testid="vida-stats">
                  <dl className="grid grid-cols-4 gap-x-6 gap-y-6 max-md:grid-cols-2">
                    {NUMBERS[period].map((n) => (
                      <div key={n.key} className="flex flex-col gap-1.5">
                        <dd className="v-sign order-1 text-[clamp(52px,5.6vw,84px)] whitespace-nowrap">
                          <Ticker
                            key={`${period}-${n.key}`}
                            value={n.value}
                            decimals={n.decimals}
                            suffix={n.suffix}
                            duration={1100}
                          />
                        </dd>
                        <dt className="order-2 text-body font-semibold text-muted-foreground">{n.label}</dt>
                        <dd className="order-3 min-h-8" aria-hidden="true">
                          <ProfileSpark values={TREND[n.key] ?? []} label={`Tendência de ${n.label}`} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="grid gap-4 min-[760px]:grid-cols-2">
                    {MODES[period].map((m) => (
                      <div key={m.mode} className="v-inner bg-(--fill-rest) p-4">
                        <h3 className="pb-3 label-caps text-muted-foreground">{m.mode}</h3>
                        <dl className="grid gap-2">
                          {m.rows.map(([label, value, decimals, suffix]) => (
                            <div key={label} className="flex items-baseline justify-between gap-4">
                              <dt className="text-body-sm text-muted-foreground">{label}</dt>
                              <dd className="v-sign text-[30px]">
                                <Ticker
                                  key={`${period}-${m.mode}-${label}`}
                                  value={value}
                                  decimals={decimals}
                                  suffix={suffix}
                                  duration={900}
                                />
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Block>

            {showStats ? <ProfileCharts /> : null}

            <Block title="Vitrine do Loadout">
              {hasLoadout ? (
                <ul
                  className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-2 max-[520px]:grid-cols-1"
                  data-testid="vida-showcase"
                >
                  {SHOWCASE.map((s) => {
                    const skin = skins[s.skin];
                    if (!skin) return null;
                    return (
                      <li key={s.skin}>
                        <SkinCard
                          skin={skin}
                          statTrak={s.statTrak}
                          sides={s.sides}
                          meta={s.meta}
                          equip
                          className="h-full"
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="grid justify-items-center gap-3 py-6 text-center" data-testid="vida-showcase-empty">
                  <EmptyScene kind="weapon" weaponImage={skins[222]?.image} />
                  <p className="text-md font-semibold">
                    {unclaimed ? `${name} ainda não montou um Loadout` : 'Nenhum Item equipado'}
                  </p>
                  <p className="max-w-[44ch] text-body-sm text-muted-foreground">
                    {unclaimed
                      ? 'Quando a pessoa reivindicar a Conta e equipar skins, a vitrine aparece aqui.'
                      : 'Adicione uma skin ao Inventário e equipe: ela aparece aqui e no jogo.'}
                  </p>
                  {fresh ? (
                    <a href="/inventario" className="v-cta mt-1">
                      Adicionar o primeiro Item
                    </a>
                  ) : null}
                </div>
              )}
            </Block>
          </div>

          <aside className="grid content-start gap-4" aria-label="Atividade">
            {playing ? (
              <section
                data-map="mirage"
                className="v-card v-spot v-panel relative flex min-h-[220px] flex-col overflow-hidden"
              >
                <MapPicture map="mirage" sizes="360px" className="absolute inset-0" imgClassName="v-map-img" />
                <span aria-hidden="true" className="v-card-wash" />
                <div className="relative z-10 flex flex-1 flex-col gap-3 p-5">
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-(--v-scrim)/80 px-3 py-[6px] text-caption font-semibold">
                    <StatusDot tone="online" pulse />
                    Jogando agora
                  </span>
                  <div className="mt-auto grid gap-1">
                    <h2 className="text-[20px] font-bold tracking-[-0.02em]">Retake · Rotação</h2>
                    <p className="text-body-sm text-(--on-map-muted)">Mirage · #1 · 8 de 9 jogadores</p>
                  </div>
                  <a href="#jogar" className="v-cta">
                    Entrar junto
                  </a>
                </div>
              </section>
            ) : null}
            {priv ? null : (
              <Block title="Sessões de jogo">
                {fresh ? (
                  <div className="grid justify-items-center gap-2 py-2 text-center">
                    <EmptyScene kind="friends" />
                    <p className="text-body-sm text-muted-foreground">
                      As sessões aparecem aqui depois do primeiro jogo.
                    </p>
                  </div>
                ) : (
                  <ul className="grid gap-1">
                    {SESSIONS.filter((s) => !(unclaimed && s.live)).map((s, i) => (
                      <li
                        key={s.where + s.when}
                        style={{ '--i': i } as CSSProperties}
                        className="enter-stagger v-inner flex items-center justify-between gap-3 p-2 transition-colors duration-(--dur-fast) hover:bg-(--fill-hover)"
                      >
                        <span className="grid">
                          <span className="text-body font-semibold">{s.where}</span>
                          <span className="text-caption text-muted-foreground">{s.when}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 text-body-sm text-muted-foreground tabular-nums">
                          {s.live ? <StatusDot tone="online" pulse /> : null}
                          {s.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Block>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
