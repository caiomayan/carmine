'use client';

import { m } from 'framer-motion';
import Link from 'next/link';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { DynamicButton } from '@/components/home/dynamic-button';
import { PlayerAvatar } from '@/components/home/player-avatar';
import { ConnectHelp, useConnect } from '@/components/servers/connect';
import { StatusDot } from '@/components/status-dot';
import { type ArtPair, choicePalette } from '@/components/vida/map-art';
import { MapPicture, useArtChoice } from '@/components/vida/map-picture';
import { Ticker } from '@/components/vida/ticker';
import { mapVars } from '@/lib/home/map-colors';
import { serverLabel, steamConnectUrl } from '@/lib/live-servers';
import { mapDisplayName, mapSlug } from '@/lib/map-art';
import { cn } from '@/lib/utils';
import {
  advance,
  type LiveState,
  type Match,
  type RosterPlayer,
  ranked,
  SCENARIO_KEYS,
  SCENARIOS,
  type Scenario,
  type ScenarioKey,
  type Side,
  type Today,
} from './data';
import { Digits } from './digits';
import '@/components/home/home.css';
import './servidor-proto.css';

const SIDE_NAME: Record<Side, string> = { ct: 'Contra-terroristas', t: 'Terroristas' };
const SIDE_SHORT: Record<Side, string> = { ct: 'CT', t: 'TR' };

/**
 * PROTÓTIPO da página do servidor (/servidores/[id]) na linguagem Vida: o mapa de borda a borda com a cor dele, o
 * placar ao vivo CT×TR (dígitos rolando), os jogadores dos dois lados e o histórico do dia. Dados fixos de exemplo
 * (`data.ts`); a barra do fim troca o estado e liga a simulação de rounds.
 */
export function ServidorProto({
  scenarioKey,
  art,
  sim: simFromUrl,
  simMs,
  bar,
}: {
  scenarioKey: ScenarioKey;
  art: Record<string, ArtPair>;
  sim: boolean;
  simMs: number;
  bar: boolean;
}) {
  const scenario = SCENARIOS[scenarioKey];
  const { server, today } = scenario;
  const live = server.state !== 'offline';
  const warmup = scenario.match?.warmup === true;
  const shownMap = live ? server.map : server.lastMap;
  const slug = mapSlug(shownMap);
  const pair = slug ? art[slug] : undefined;
  const choice = useArtChoice(pair);
  const vars = useMemo(() => mapVars(choice?.colors), [choice]);
  const ambient = live && choice ? choicePalette(choice) : null;

  // ---- a simulação: o estado do jogo vive aqui para o placar, a lista e a barra de vagas andarem juntos.
  const [sim, setSim] = useState(simFromUrl);
  const [game, setGame] = useState<LiveState>({
    match: scenario.match ?? { round: 0, ctScore: 0, tScore: 0, warmup: false },
    players: scenario.players,
    step: 0,
  });
  const canSim = scenario.match !== null && !warmup && live;
  useEffect(() => {
    if (!sim || !canSim) return;
    const timer = setInterval(() => setGame((state) => advance(state)), simMs);
    return () => clearInterval(timer);
  }, [sim, canSim, simMs]);
  const match: Match | null = scenario.match ? game.match : null;

  return (
    <div
      data-vida="on"
      data-testid="servidor-proto"
      data-estado={scenarioKey}
      data-map={slug ?? undefined}
      style={
        {
          ...vars,
          ...(ambient
            ? { '--amb-1': ambient[0], '--amb-2': ambient[1], '--amb-3': ambient[2] }
            : {}),
        } as CSSProperties
      }
    >
      <div aria-hidden="true" className="v-ambient">
        <i />
        <i />
        <i />
      </div>

      <div className="container-page relative pb-40">
        {pair && slug ? <HeroArt slug={slug} art={pair} asleep={!live} /> : null}

        <div className="vs-hero">
          <Head scenario={scenario} warmup={warmup} mapName={mapDisplayName(shownMap)} />
          <ScoreCard scenario={scenario} match={match} players={game.players} sim={sim && canSim} />
        </div>

        <Roster scenario={scenario} players={game.players} />
        <TodayPanel today={today} live={live} art={art} />
      </div>

      {bar ? (
        <ProtoBar
          current={scenarioKey}
          sim={sim}
          canSim={canSim}
          onSim={() => setSim((on) => !on)}
        />
      ) : null}
    </div>
  );
}

/* ---------- arte de borda a borda ---------- */

function HeroArt({ slug, art, asleep }: { slug: string; art: ArtPair; asleep: boolean }) {
  return (
    <div aria-hidden="true" className="vs-art" data-asleep={asleep || undefined}>
      <MapPicture map={slug} art={art} priority sizes="100vw" className="size-full" />
    </div>
  );
}

/* ---------- cabeçalho: mapa grande, nome, conectar ---------- */

function Head({
  scenario,
  warmup,
  mapName,
}: {
  scenario: Scenario;
  warmup: boolean;
  mapName: string | null;
}) {
  const { server, offlineMinutes } = scenario;
  const live = server.state !== 'offline';
  const full = server.state === 'full';
  const connect = useConnect(server);

  return (
    <div className="vs-head">
      <Link href="/" className="vs-back">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3 5 8l5 5" />
        </svg>
        Servidores
      </Link>

      <p className="vs-meta">
        <span className="vs-status">
          <StatusDot tone={live ? (full ? 'warn' : 'online') : 'offline'} pulse={live && !full} />
          {live ? (full ? 'Lotado' : warmup ? 'Aquecimento' : 'Ao vivo') : 'Offline'}
        </span>
        <span className="vs-chip">{server.mode === 'retake' ? 'Retake' : 'Deathmatch'}</span>
        <span className="vs-meta-text">
          {server.code ? <span className="tabular-nums">{server.code}</span> : null}
          <span>São Paulo</span>
        </span>
      </p>

      {mapName ? (
        <p className="vs-map v-sign" data-testid="servidor-map">
          {!live ? <span className="sr-only">Último mapa: </span> : null}
          {mapName}
        </p>
      ) : null}
      <h1 className="vs-name">{serverLabel(server)}</h1>
      <p className="vs-sub">
        <span>{server.name}</span>
        {!live ? (
          <span>
            Offline há {offlineMinutes} min · último mapa {mapName}
          </span>
        ) : null}
      </p>

      {live ? (
        <>
          <div className="vs-connect">
            <DynamicButton
              idle="Conectar"
              loading="Abrindo o CS2…"
              href={steamConnectUrl(server.address)}
              ariaLabel={`Conectar em ${serverLabel(server)}`}
              describedBy={connect.help !== 'closed' ? connect.helpId : undefined}
              onAction={() => {
                connect.opening();
                return undefined;
              }}
              className="pointer-coarse:hidden"
              testId="connect"
            />
            <DynamicButton
              variant="quiet"
              idle="Copiar IP"
              loading="Copiando…"
              done="IP copiado"
              ariaLabel={`Copiar o IP de ${serverLabel(server)}`}
              loadingMs={650}
              doneMs={1800}
              onAction={connect.copyAddress}
              testId="copy-ip"
            />
            <span className="vs-address">
              <span className="v-label">Endereço</span>
              <span className="tabular-nums">{server.address}</span>
            </span>
          </div>
          <ConnectHelp server={server} connect={connect} showFullHint={false} />
          {full ? <p className="vs-note">Lotado: com VIP você entra pela Vaga reservada.</p> : null}
        </>
      ) : (
        <p className="vs-note">
          O servidor não manda sinal há {offlineMinutes} minutos. Quando voltar, o placar e os
          jogadores aparecem aqui.
        </p>
      )}
    </div>
  );
}

/* ---------- placar ao vivo ---------- */

function ScoreCard({
  scenario,
  match,
  players,
  sim,
}: {
  scenario: Scenario;
  match: Match | null;
  players: RosterPlayer[];
  sim: boolean;
}) {
  const { server, today } = scenario;
  const live = server.state !== 'offline';
  const lastMatch = today.maps.at(-1);

  // Offline: a última partida do dia (o que o histórico já sabe), sem placar vivo.
  if (!live) {
    return (
      <section className="vs-score" aria-labelledby="vs-score-title" data-kind="offline">
        <p id="vs-score-title" className="v-label">
          Servidor offline
        </p>
        <p className="vs-score-big v-serif">Dormindo</p>
        {lastMatch ? (
          <p className="vs-score-lead">
            A última partida de hoje foi em <b>{mapDisplayName(lastMatch.map)}</b>:{' '}
            <span className="tabular-nums">
              {lastMatch.ctWins} × {lastMatch.tWins}
            </span>{' '}
            em {lastMatch.rounds} rounds.
          </p>
        ) : null}
        <Slots count={0} max={server.maxPlayers} />
      </section>
    );
  }

  if (match?.warmup) {
    return (
      <section className="vs-score" aria-labelledby="vs-score-title" data-kind="warmup">
        <p id="vs-score-title" className="v-label vs-live">
          <StatusDot tone="warn" pulse /> Aquecimento
        </p>
        <p className="vs-score-big v-serif">Esquentando</p>
        <p className="vs-score-lead">O placar começa a contar no primeiro round da partida.</p>
        <Slots count={players.length} max={server.maxPlayers} />
      </section>
    );
  }

  if (!match) {
    return (
      <section className="vs-score" aria-labelledby="vs-score-title" data-kind="empty">
        <p id="vs-score-title" className="v-label">
          Sem partida
        </p>
        <p className="vs-score-big v-serif">Ninguém por aqui</p>
        <p className="vs-score-lead">
          Entre agora e comece uma partida de {server.mode === 'retake' ? 'Retake' : 'Deathmatch'}.
        </p>
        <Slots count={0} max={server.maxPlayers} />
      </section>
    );
  }

  const total = match.ctScore + match.tScore;
  const ctShare = total === 0 ? 50 : (match.ctScore / total) * 100;
  const lead: Side | null =
    match.ctScore === match.tScore ? null : match.ctScore > match.tScore ? 'ct' : 't';

  return (
    <section
      className="vs-score"
      aria-labelledby="vs-score-title"
      data-kind="live"
      data-testid="placar"
    >
      <div className="vs-score-top">
        <p id="vs-score-title" className="v-label vs-live">
          <StatusDot tone="online" pulse /> Placar ao vivo
        </p>
        <p className="v-label vs-round">
          Round <Digits value={match.round} className="vs-round-digits" />
        </p>
      </div>

      <div className="vs-board">
        <Team side="ct" score={match.ctScore} dim={lead === 't'} />
        <span aria-hidden="true" className="vs-colon">
          ×
        </span>
        <Team side="t" score={match.tScore} dim={lead === 'ct'} />
      </div>

      <div className="vs-split" aria-hidden="true">
        <span style={{ width: `${ctShare}%` }} data-side="ct" />
        <span style={{ width: `${100 - ctShare}%` }} data-side="t" />
      </div>

      <Slots count={players.length} max={server.maxPlayers} />
      {sim ? <p className="vs-sim v-label">Simulando rounds</p> : null}
    </section>
  );
}

function Team({ side, score, dim }: { side: Side; score: number; dim: boolean }) {
  return (
    <div className="vs-team" data-side={side} data-dim={dim || undefined}>
      <span className="vs-team-label">
        <span aria-hidden="true" className="vs-dot" />
        <abbr title={SIDE_NAME[side]}>{SIDE_SHORT[side]}</abbr>
      </span>
      <span className="vs-score-digits v-sign">
        <Digits value={score} />
      </span>
    </div>
  );
}

function Slots({ count, max }: { count: number; max: number }) {
  return (
    <div className="vs-slots">
      <p>
        <span className="tabular-nums">
          <Ticker value={count} />
          <span className="text-muted-foreground">/{max}</span>
        </span>{' '}
        <span className="text-muted-foreground">jogadores</span>
      </p>
      <div className="vh-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.min(1, count / max)})` }} />
      </div>
    </div>
  );
}

/* ---------- jogadores dos dois lados ---------- */

function Roster({ scenario, players }: { scenario: Scenario; players: RosterPlayer[] }) {
  const { server } = scenario;
  const live = server.state !== 'offline';

  return (
    <section aria-labelledby="vs-roster" className="vs-section" data-testid="jogadores">
      <div className="vs-section-head">
        <h2 id="vs-roster" className="v-title">
          Jogadores
        </h2>
        {live && players.length > 0 ? (
          <p className="vs-section-note">
            <span className="tabular-nums">{players.length}</span> no servidor agora
          </p>
        ) : null}
      </div>

      {players.length === 0 ? (
        <div className="vs-empty">
          <p className="vs-empty-title">{live ? 'Ninguém jogando agora' : 'Ninguém conectado'}</p>
          <p>
            {live
              ? 'Os jogadores aparecem aqui, separados por lado, assim que alguém entrar.'
              : 'O servidor está offline. Os jogadores aparecem aqui quando ele voltar.'}
          </p>
        </div>
      ) : (
        <div className="vs-teams">
          <TeamList side="ct" players={ranked(players, 'ct')} />
          <TeamList side="t" players={ranked(players, 't')} />
        </div>
      )}
    </section>
  );
}

function TeamList({ side, players }: { side: Side; players: RosterPlayer[] }) {
  return (
    <div className="vs-team-panel" data-side={side}>
      <div className="vs-team-head">
        <span className="vs-team-title">
          <span aria-hidden="true" className="vs-dot" />
          {SIDE_NAME[side]}
        </span>
        <span className="vs-cols" aria-hidden="true">
          <span>
            <span className="max-md:hidden">Abates</span>
            <span className="md:hidden">A</span>
          </span>
          <span>
            <span className="max-md:hidden">Mortes</span>
            <span className="md:hidden">M</span>
          </span>
          <span>
            <span className="max-md:hidden">Pontos</span>
            <span className="md:hidden">P</span>
          </span>
        </span>
      </div>
      <ul aria-label={SIDE_NAME[side]} className="vs-rows">
        {players.map((player, index) => (
          <m.li
            key={player.id}
            layout="position"
            transition={{ type: 'spring', stiffness: 520, damping: 42 }}
            className="vs-row"
            data-private={player.name === null || undefined}
            data-testid="jogador"
          >
            <span className="vs-rank v-sign" aria-hidden="true">
              {index + 1}
            </span>
            <span className="vs-who">
              {player.name === null ? (
                <>
                  <span className="vs-anon">
                    <span aria-hidden="true" className="vs-anon-disc" />
                    <span aria-hidden="true" className="vs-presence" />
                  </span>
                  <span className="vs-private">Jogador privado</span>
                </>
              ) : (
                <>
                  <PlayerAvatar src={null} name={player.name} size={36} playing />
                  <Link href={`/${player.publicId}` as never} className="vs-player-link">
                    {player.name}
                  </Link>
                </>
              )}
            </span>
            <span className="vs-nums">
              <Stat label="Abates" value={player.kills} />
              <Stat label="Mortes" value={player.deaths} />
              <Stat label="Pontos" value={player.score} strong />
            </span>
          </m.li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <span className={cn('vs-stat', strong && 'vs-stat-strong')}>
      <span className="sr-only">{label} </span>
      <Digits value={value} />
    </span>
  );
}

/* ---------- histórico do dia ---------- */

function TodayPanel({
  today,
  live,
  art,
}: {
  today: Today;
  live: boolean;
  art: Record<string, ArtPair>;
}) {
  const { rounds } = today;
  const ctShare = rounds.played === 0 ? 50 : (rounds.ctWins / rounds.played) * 100;
  const maxHour = Math.max(1, ...today.hours);
  const busiest = today.hours.indexOf(Math.max(...today.hours));
  const first = today.hours.findIndex((n) => n > 0);

  return (
    <section aria-labelledby="vs-today" className="vs-section" data-testid="hoje">
      <div className="vs-section-head">
        <h2 id="vs-today" className="v-title">
          Hoje no servidor
        </h2>
        <p className="vs-section-note">{today.dateLabel} · horário de Brasília</p>
      </div>

      <div className="vs-tiles">
        <div className="vs-tile">
          <p className="v-label">Rounds jogados</p>
          <p className="vs-tile-num v-serif">
            <Ticker value={rounds.played} />
          </p>
          <p className="vs-tile-foot">
            em <span className="tabular-nums">{today.maps.length}</span> partidas
          </p>
        </div>
        <div className="vs-tile">
          <p className="v-label">Vitórias</p>
          <p className="vs-tile-num v-serif tabular-nums">
            <span data-side="ct" data-win={rounds.ctWins > rounds.tWins || undefined}>
              {rounds.ctWins}
            </span>
            <span aria-hidden="true" className="vs-tile-x">
              ×
            </span>
            <span data-side="t" data-win={rounds.tWins > rounds.ctWins || undefined}>
              {rounds.tWins}
            </span>
          </p>
          <div className="vs-split vs-split-sm" aria-hidden="true">
            <span style={{ width: `${ctShare}%` }} data-side="ct" />
            <span style={{ width: `${100 - ctShare}%` }} data-side="t" />
          </div>
          <p className="vs-tile-foot">
            <span className="vs-key" data-side="ct">
              CT
            </span>{' '}
            <span className="vs-key" data-side="t">
              TR
            </span>
          </p>
        </div>
        <div className="vs-tile">
          <p className="v-label">Pico de jogadores</p>
          <p className="vs-tile-num v-serif">
            <Ticker value={today.peakPlayers.count} />
          </p>
          <p className="vs-tile-foot">
            às <span className="tabular-nums">{today.peakPlayers.at}</span>
          </p>
        </div>
        <div className="vs-tile">
          <p className="v-label">Jogadores diferentes</p>
          <p className="vs-tile-num v-serif">
            <Ticker value={today.uniquePlayers} />
          </p>
          <p className="vs-tile-foot">passaram por aqui hoje</p>
        </div>
      </div>

      <div className="vs-today-grid">
        <div className="vs-card">
          <h3 className="vs-card-title">Partidas</h3>
          <ol className="vs-maps">
            {[...today.maps].reverse().map((row) => {
              const rowSlug = mapSlug(row.map) ?? '';
              const now = row.to === null;
              return (
                <li
                  key={`${row.map}-${row.from}`}
                  className="vs-map-row"
                  data-now={now || undefined}
                >
                  <span className="vs-thumb" aria-hidden="true">
                    <MapPicture
                      map={rowSlug}
                      art={art[rowSlug]}
                      sizes="96px"
                      className="size-full"
                    />
                  </span>
                  <span className="vs-map-name">
                    <span className="v-sign">{mapDisplayName(row.map)}</span>
                    <span className="vs-map-time tabular-nums">
                      {row.from} – {row.to ?? (live ? 'agora' : '')}
                    </span>
                  </span>
                  <span className="vs-map-score tabular-nums">
                    {now ? (
                      <span className="vs-now">
                        <StatusDot tone="online" pulse /> Agora
                      </span>
                    ) : null}
                    <span>
                      <span data-side="ct" data-win={row.ctWins > row.tWins || undefined}>
                        {row.ctWins}
                      </span>
                      <span aria-hidden="true" className="vs-map-x">
                        ×
                      </span>
                      <span data-side="t" data-win={row.tWins > row.ctWins || undefined}>
                        {row.tWins}
                      </span>
                    </span>
                    <span className="vs-map-rounds">{row.rounds} rounds</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="vs-card vs-card-chart">
          <h3 className="vs-card-title">Rounds por hora</h3>
          <div
            className="vs-hours"
            role="img"
            aria-label={`Rounds por hora. O mais movimentado foi às ${busiest}h, com ${today.hours[busiest]} rounds.`}
          >
            {today.hours.map((count, hour) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: as 24 horas do dia, sempre na mesma ordem
                key={hour}
                className="vs-hour"
                data-now={hour === today.nowHour || undefined}
                data-empty={count === 0 || undefined}
                title={`${hour}h: ${count} rounds`}
              >
                <i style={{ height: `${Math.max(2, (count / maxHour) * 100)}%` }} />
              </span>
            ))}
          </div>
          <div aria-hidden="true" className="vs-hour-axis">
            {[0, 6, 12, 18, 23].map((hour) => (
              <span key={hour} style={{ left: `${((hour + 0.5) / 24) * 100}%` }}>
                {hour}h
              </span>
            ))}
          </div>
          <p className="vs-card-foot">
            {first >= 0 ? `Movimento desde as ${first}h.` : 'Sem rounds hoje.'} O mais cheio foi às{' '}
            <span className="tabular-nums">{busiest}h</span>.
          </p>
        </div>
      </div>

      <p className="vs-since">Histórico detalhado coletado desde 24 de outubro.</p>
    </section>
  );
}

/* ---------- barra do protótipo (só aqui; não existe na página de verdade) ---------- */

function ProtoBar({
  current,
  sim,
  canSim,
  onSim,
}: {
  current: ScenarioKey;
  sim: boolean;
  canSim: boolean;
  onSim: () => void;
}) {
  return (
    <nav aria-label="Estados do protótipo" className="vs-bar v-glass">
      <span className="vs-bar-label">Protótipo · dados de exemplo</span>
      <span className="vs-bar-states">
        {SCENARIO_KEYS.map((key) => (
          <Link
            key={key}
            href={`/dev/servidor?estado=${key}` as never}
            aria-current={key === current ? 'page' : undefined}
            className="vs-bar-link"
          >
            {SCENARIOS[key].label}
          </Link>
        ))}
      </span>
      <button
        type="button"
        className="vs-bar-link"
        aria-pressed={sim}
        disabled={!canSim}
        onClick={onSim}
      >
        {sim ? 'Parar rounds' : 'Simular rounds'}
      </button>
    </nav>
  );
}
