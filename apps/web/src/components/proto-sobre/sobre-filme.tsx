'use client';

import Link from 'next/link';
import { type CSSProperties, useEffect, useMemo, useRef } from 'react';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import type { ArtPair } from '@/components/vida/map-art';
import { MapPicture, useArtChoice } from '@/components/vida/map-picture';
import { mapVars } from '@/lib/home/map-colors';
import { makeShards } from '@/lib/proto-sobre/shards';
import type { ShowSkin } from '@/lib/proto-sobre/skins';
import { cn } from '@/lib/utils';
import { SpotlightText } from './spotlight-text';
import '@/components/home/home.css';
import './sobre.css';

/**
 * PROTÓTIPO da página "Sobre" em formato de filme (vitrine /dev/sobre): uma narrativa em cenas que se desenrolam com
 * a rolagem. É a única página que usa o GSAP (ScrollTrigger), importado só aqui e só no navegador. Sem GSAP (ou com
 * `prefers-reduced-motion`) a página é estática e inteira legível: as cenas empilham, o texto aparece por completo e
 * nada fica preso à rolagem. Os dados são exemplos (nomes fictícios, números inventados para o desenho).
 */

export type SobreData = {
  art: Record<string, ArtPair>;
  retakeSkins: ShowSkin[];
  deathmatchSkins: ShowSkin[];
  discordUrl: string;
};

/** O papel da abertura: 9 × 6 células, 2 triângulos por célula. */
const SHARDS = makeShards(9, 6);

/** Ranking de exemplo (nomes fictícios): o Retake ordena por rounds vencidos e o Deathmatch por kills por minuto. */
const RETAKE_TOP = [
  { name: 'Rafa Tavares', value: 187 },
  { name: 'Bia Montenegro', value: 171 },
  { name: 'Juca', value: 164 },
] as const;
const RETAKE_ROWS = [
  { name: 'Lipe Duarte', value: 150 },
  { name: 'Mari Alencar', value: 143 },
  { name: 'Camila Reis', value: 139 },
] as const;
const DM_ROWS = [
  { name: 'Duda Falcão', value: 2.41 },
  { name: 'Léo Prado', value: 2.27 },
  { name: 'Nina Castro', value: 2.1 },
  { name: 'Heitor', value: 1.96 },
  { name: 'Lúcia Brandt', value: 1.88 },
] as const;

const ACTIVITY = [
  'Rafa Tavares entrou no Retake · Mirage',
  'Bia Montenegro subiu para o 2º lugar da semana',
  'Juca equipou uma faca nova',
  'Nina Castro fez 31 abates no Dust2',
  'Lipe Duarte montou o Preset Competitivo',
  'Mari Alencar entrou no Deathmatch',
] as const;

export function SobreFilme({ art, retakeSkins, deathmatchSkins, discordUrl }: SobreData) {
  const root = useRef<HTMLElement>(null);

  // O GSAP e o ScrollTrigger entram por `import()` aqui, depois da hidratação, e só se a pessoa aceita movimento.
  useEffect(() => {
    let cancelled = false;
    let revert: (() => void) | undefined;
    void (async () => {
      const [{ gsap }, { ScrollTrigger }, { buildFilm }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('./film'),
      ]);
      const element = root.current;
      if (cancelled || !element) return;
      gsap.registerPlugin(ScrollTrigger);
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () =>
        buildFilm(gsap, ScrollTrigger, element),
      );
      revert = () => media.revert();
    })();
    return () => {
      cancelled = true;
      revert?.();
    };
  }, []);

  const shards = useMemo(() => SHARDS, []);

  return (
    <main ref={root} className="sb" data-testid="sobre">
      <nav aria-hidden="true" className="sb-rail">
        {['hero', 'spot', 'modes', 'ranking', 'comunidade', 'vip', 'end'].map((id) => (
          <i key={id} data-dot={id} />
        ))}
      </nav>

      {/* 0 · a abertura */}
      <Scene id="hero" slug="mirage" art={art} className="sb-hero" priority labelledBy="sb-title">
        <div className="sb-shards" aria-hidden="true">
          {shards.map((shard, index) => (
            <i
              // biome-ignore lint/suspicious/noArrayIndexKey: cacos fixos, gerados na mesma ordem
              key={index}
              className="sb-shard"
              data-dx={shard.dx}
              data-dy={shard.dy}
              data-rot={shard.rotation}
              data-delay={shard.delay}
              style={{
                clipPath: shard.clip,
                transformOrigin: `${shard.cx}% ${shard.cy}%`,
                background: `linear-gradient(${shard.angle}deg, hsl(42 14% ${shard.tone[0]}%), hsl(40 12% ${shard.tone[1]}%))`,
              }}
            />
          ))}
          <i className="sb-grain" />
        </div>
        <div className="container-page sb-hero-copy">
          <p className="v-label sb-kicker">Servidores comunitários de Counter-Strike 2</p>
          <h1 id="sb-title" className="sb-title v-sign">
            Saint
            <br />
            Carmine
          </h1>
          <p className="sb-lede">
            Entre num servidor, jogue, e leve o seu Loadout junto. Feito no Brasil, para quem joga
            aqui.
          </p>
        </div>
        <p aria-hidden="true" className="sb-hint v-label">
          Role
        </p>
      </Scene>

      {/* 1 · o que é (Spotlight Text) */}
      <Scene id="spot" slug="inferno" art={art} className="sb-spot" labelledBy="sb-spot-title">
        <div className="container-page">
          <p id="sb-spot-title" className="v-label sb-eyebrow">
            O que é a Saint Carmine
          </p>
          <SpotlightText>
            Uma plataforma brasileira de servidores comunitários de Counter-Strike 2. O Inventário é
            livre: você monta o seu Loadout no site e ele aparece no jogo, em todos os servidores.
            Entra, joga, e a sua identidade vai junto.
          </SpotlightText>
        </div>
      </Scene>

      {/* 2 · os dois Modos */}
      <section data-scene="modes" aria-labelledby="sb-modes-title" className="sb-scene sb-modes">
        <h2 id="sb-modes-title" className="sb-modes-title v-label">
          Dois Modos, o mesmo Loadout
        </h2>
        <div className="sb-mode-stack">
          <Mode
            mode="retake"
            slug="mirage"
            art={art}
            title="Retake"
            kicker="01 · 9 vagas"
            body="A bomba já está plantada e os CTs retomam o bombsite. Rounds de segundos, gente entrando e saindo a qualquer hora."
            server="Retake · Rotação"
            map="Mirage"
            max={9}
            now={8}
            skins={retakeSkins}
          />
          <Mode
            mode="deathmatch"
            slug="dust2"
            art={art}
            title="Deathmatch"
            kicker="02 · 16 vagas"
            body="Todo mundo contra todo mundo, volta na hora. Mira, aquecimento e uma skin nova para testar."
            server="Deathmatch · Rotação"
            map="Dust2"
            max={16}
            now={12}
            skins={deathmatchSkins}
          />
        </div>
      </section>

      {/* 3 · o Ranking da semana */}
      <Scene
        id="ranking"
        slug="nuke"
        art={art}
        className="sb-ranking"
        labelledBy="sb-ranking-title"
      >
        <div className="container-page">
          <p className="v-label sb-eyebrow">Ranking da semana</p>
          <h2 id="sb-ranking-title" className="sb-h2">
            Toda segunda, o placar zera.
          </h2>
          <div className="sb-ranking-grid">
            <div className="sb-board" data-mode="retake">
              <p className="sb-board-title">Retake · rounds vencidos</p>
              <ol className="sb-podium">
                {[1, 0, 2].map((rank) => {
                  const entry = RETAKE_TOP[rank];
                  if (!entry) return null;
                  return (
                    <li key={entry.name} className="sb-step" data-rank={rank + 1}>
                      <span className="sb-podium-who">
                        <b>{entry.name}</b>
                        <span className="tabular-nums" data-value={entry.value}>
                          {entry.value}
                        </span>
                      </span>
                      <span aria-hidden="true" className="sb-step-n v-sign">
                        {rank + 1}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <ol className="sb-rows" start={4}>
                {RETAKE_ROWS.map((row, index) => (
                  <li key={row.name} className="sb-row">
                    <span className="v-sign sb-row-n">{index + 4}</span>
                    <span>{row.name}</span>
                    <span className="tabular-nums" data-value={row.value}>
                      {row.value}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="sb-board" data-mode="deathmatch">
              <p className="sb-board-title">Deathmatch · abates por minuto</p>
              <ol className="sb-rows">
                {DM_ROWS.map((row, index) => (
                  <li key={row.name} className="sb-row">
                    <span className="v-sign sb-row-n">{index + 1}</span>
                    <span>{row.name}</span>
                    <span className="tabular-nums" data-value={row.value} data-decimals={2}>
                      {row.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <p className="sb-note">
            A semana recomeça na segunda-feira, às 00:00 de Brasília. Para entrar: 50 rounds no
            Retake ou 30 minutos no Deathmatch. Quem tem o Perfil privado aparece como “Jogador
            privado”. Nomes e números desta cena são exemplos.
          </p>
        </div>
      </Scene>

      {/* 4 · a comunidade */}
      <Scene
        id="comunidade"
        slug="overpass"
        art={art}
        className="sb-community"
        labelledBy="sb-community-title"
      >
        <div className="container-page">
          <p className="v-label sb-eyebrow">Comunidade</p>
          <h2 id="sb-community-title" className="sb-h2">
            O servidor acorda quando o primeiro entra.
          </h2>
          <p className="sb-copy">
            A gente se encontra no Discord: combina jogo, pede ajuda, abre recurso, comemora o
            Ranking. Um amigo no Discord e o servidor já está no ar.
          </p>
          <Button asChild className="sb-cta">
            <a href={discordUrl} target="_blank" rel="noopener noreferrer">
              Entrar no Discord
            </a>
          </Button>
        </div>
        <div aria-hidden="true" className="sb-marquees">
          {[0, 1].map((row) => (
            <div key={row} className="sb-marquee">
              <div className="sb-marquee-track">
                {[...ACTIVITY, ...ACTIVITY, ...ACTIVITY, ...ACTIVITY].map((line, index) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: faixa decorativa repetida
                    key={index}
                    className="sb-chip"
                  >
                    <StatusDot tone="online" />
                    {row === 0 ? line : ACTIVITY[(index + 3) % ACTIVITY.length]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Scene>

      {/* 5 · o VIP */}
      <Scene id="vip" slug="anubis" art={art} className="sb-vip" labelledBy="sb-vip-title">
        <div className="container-page">
          <p className="v-label sb-eyebrow">VIP</p>
          <h2 id="sb-vip-title" className="sb-h2">
            Servidor lotado? O VIP entra.
          </h2>
          <div aria-hidden="true" className="sb-slots">
            {Array.from({ length: 9 }, (_, slot) => (
              <i
                // biome-ignore lint/suspicious/noArrayIndexKey: nove vagas fixas
                key={slot}
                className="sb-slot"
                data-slot={slot === 8 ? 'last' : undefined}
              />
            ))}
            <i className="sb-slot sb-slot-vip">VIP</i>
          </div>
          <ul className="sb-perks">
            <li className="sb-perk">
              <b>Vaga reservada</b>
              <span>
                No Retake, no lugar de um jogador sem VIP; no Deathmatch, por vagas extras.
              </span>
            </li>
            <li className="sb-perk">
              <b>Mais Presets</b>
              <span>
                O plano grátis tem o Preset principal. Com VIP, guarde mais Loadouts e troque de um
                para o outro de uma vez.
              </span>
            </li>
            <li className="sb-perk">
              <b>Itens exclusivos</b>
              <span>Agentes e music kits são do VIP.</span>
            </li>
            <li className="sb-perk">
              <b>Cargo no Discord</b>
              <span>Vincule o Discord e receba o cargo VIP no nosso servidor.</span>
            </li>
          </ul>
        </div>
      </Scene>

      {/* 6 · o fim */}
      <Scene id="end" slug="ancient" art={art} className="sb-end" labelledBy="sb-end-title">
        <div className="container-page sb-end-copy">
          <p aria-hidden="true" className="sb-seal v-sign">
            Saint Carmine
          </p>
          <h2 id="sb-end-title" className="sb-h2">
            Pronto para jogar?
          </h2>
          <div className="sb-actions">
            <Button asChild>
              <Link href="/entrar">Entrar com a Steam</Link>
            </Button>
            <Button asChild variant="quiet">
              <Link href="/">Ver os servidores</Link>
            </Button>
          </div>
        </div>
      </Scene>
    </main>
  );
}

/** Uma cena: a seção com a arte do mapa ao fundo e a cor do mapa em variáveis (o selo, as barras, o brilho). */
function Scene({
  id,
  slug,
  art,
  className,
  priority = false,
  labelledBy,
  children,
}: {
  id: string;
  slug: string;
  art: Record<string, ArtPair>;
  className?: string;
  priority?: boolean;
  labelledBy: string;
  children: React.ReactNode;
}) {
  const pair = art[slug];
  const choice = useArtChoice(pair);
  const vars = useMemo(() => mapVars(choice?.colors), [choice]);
  return (
    <section
      data-scene={id}
      aria-labelledby={labelledBy}
      className={cn('sb-scene', className)}
      style={vars as CSSProperties}
    >
      {pair ? (
        <div aria-hidden="true" className={cn('sb-bg', `sb-bg-${id}`)}>
          <MapPicture
            map={slug}
            art={pair}
            priority={priority}
            sizes="100vw"
            className="size-full"
          />
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Um Modo: o mapa, o texto, o servidor de exemplo e o Loadout (as skins são do catálogo de verdade). */
function Mode({
  mode,
  slug,
  art,
  title,
  kicker,
  body,
  server,
  map,
  max,
  now,
  skins,
}: {
  mode: 'retake' | 'deathmatch';
  slug: string;
  art: Record<string, ArtPair>;
  title: string;
  kicker: string;
  body: string;
  server: string;
  map: string;
  max: number;
  now: number;
  skins: ShowSkin[];
}) {
  const pair = art[slug];
  const choice = useArtChoice(pair);
  const vars = useMemo(() => mapVars(choice?.colors), [choice]);
  return (
    <div className="sb-mode" data-mode={mode} style={vars as CSSProperties}>
      {pair ? (
        <div aria-hidden="true" className="sb-bg">
          <MapPicture map={slug} art={pair} sizes="100vw" className="size-full" />
        </div>
      ) : null}
      <div className="container-page sb-mode-grid">
        <div className="sb-mode-copy">
          <p className="v-label sb-reveal sb-kicker">{kicker}</p>
          <h3 className="sb-reveal sb-mode-title v-sign">{title}</h3>
          <p className="sb-reveal sb-copy">{body}</p>
          <div className="sb-reveal sb-server">
            <span className="vh-chip">{title}</span>
            <span className="sb-server-name">{server}</span>
            <span className="sb-server-map v-sign">{map}</span>
            <span className="sb-server-count tabular-nums">
              <b data-count={mode}>{now}</b>/{max} jogadores
            </span>
            <span className="vh-bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${now / max})` }} />
            </span>
            <span className="sb-tag">Exemplo</span>
          </div>
        </div>
        <ul className="sb-skins" aria-label={`Loadout de exemplo no ${title}`}>
          {skins.map((skin) => (
            <li
              key={skin.id}
              className="sb-skin"
              style={{ '--rar': `var(--rarity-${skin.rarity})` } as CSSProperties}
            >
              {/* biome-ignore lint/performance/noImgElement: imagem externa do catálogo, pequena */}
              <img src={skin.image} alt="" width={256} height={192} loading="lazy" />
              <span className="sb-skin-name">
                <b>{skin.subtitle ?? skin.title}</b>
                <span>{skin.subtitle ? skin.title : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
