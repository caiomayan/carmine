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
  alphabetical,
  type LiveState,
  type Match,
  minutesBetween,
  type RosterPlayer,
  ranked,
  rankedAll,
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
 * placar ao vivo CT×TR (dígitos rolando), os jogadores dos dois lados e o histórico do dia. O Deathmatch troca o
 * placar de times pelo líder e a lista dos dois lados por uma lista única por pontos. Dados fixos de exemplo
 * (`data.ts`); a barra do fim troca o estado e liga a simulação.
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
  const dm = server.mode === 'deathmatch';
  const shownMap = live ? server.map : server.lastMap;
  const slug = mapSlug(shownMap);
  const pair = slug ? art[slug] : undefined;
  const choice = useArtChoice(pair);
  const vars = useMemo(() => mapVars(choice?.colors), [choice]);
  const ambient = live && choice ? choicePalette(choice) : null;

  // ---- a simulação: o estado do jogo vive aqui para o placar, a lista e a barra de vagas andarem juntos.
  const [sim, setSim] = useState(simFromUrl);
  const [game, setGame] = useState<LiveState>({
    match: scenario.match,
    players: scenario.players,
    step: 0,
  });
  const canSim =
    live && !warmup && (scenario.match !== null || (dm && scenario.players.length > 0));
  useEffect(() => {
    if (!sim || !canSim) return;
    const timer = setInterval(() => setGame((state) => advance(state)), simMs);
    return () => clearInterval(timer);
  }, [sim, canSim, simMs]);

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
          {dm && live ? (
            <LeaderCard scenario={scenario} players={game.players} sim={sim && canSim} />
          ) : (
            <ScoreCard
              scenario={scenario}
              match={game.match}
              players={game.players}
              sim={sim && canSim}
            />
          )}
        </div>

        <Roster scenario={scenario} players={game.players} warmup={warmup} />
        <TodayPanel today={today} live={live} dm={dm} art={art} />
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
          {live ? (full ? 'Lotado' : warmup ? 'Esquentando' : 'Ao vivo') : 'Offline'}
        </span>
        <span className="vs-chip">{server.mode === 'retake' ? 'Retake' : 'Deathmatch'}</span>
      </p>

      {mapName ? (
        <p className="vs-map v-sign" data-testid="servidor-map">
          {!live ? <span className="sr-only">Último mapa: </span> : null}
          {mapName}
        </p>
      ) : null}
      <h1 className="vs-name">{serverLabel(server)}</h1>
      {!live ? (
        <p className="vs-sub">
          <span>
            Offline há {offlineMinutes} min · último mapa {mapName}
          </span>
        </p>
      ) : null}

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

/* ---------- placar ao vivo (Retake) ---------- */

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
  const lastMap = today.maps.at(-1);

  // Offline: o último mapa do dia (o que o histórico já sabe), sem placar vivo.
  if (!live) {
    return (
      <section className="vs-score" aria-labelledby="vs-score-title" data-kind="offline">
        <p id="vs-score-title" className="v-label">
          Servidor offline
        </p>
        <p className="vs-score-big v-serif">Dormindo</p>
        {lastMap && lastMap.ctWins !== null ? (
          <p className="vs-score-lead">
            O último mapa de hoje foi <b>{mapDisplayName(lastMap.map)}</b>:{' '}
            <span className="tabular-nums">
              {lastMap.ctWins} × {lastMap.tWins}
            </span>{' '}
            em rounds ganhos, {lastMap.rounds} no total.
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
          <StatusDot tone="warn" pulse /> Sem placar ainda
        </p>
        <p className="vs-score-big v-serif">Esquentando</p>
        <p className="vs-score-lead">O placar começa a contar no primeiro round do mapa.</p>
        <Slots count={players.length} max={server.maxPlayers} />
      </section>
    );
  }

  if (!match) {
    return (
      <section className="vs-score" aria-labelledby="vs-score-title" data-kind="empty">
        <p id="vs-score-title" className="v-label">
          Sem jogo
        </p>
        <p className="vs-score-big v-serif">Ninguém por aqui</p>
        <p className="vs-score-lead">Entre agora e comece a jogar Retake.</p>
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
      <p className="vs-score-cap">Rounds ganhos por lado neste mapa</p>

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

/* ---------- o líder (Deathmatch) ---------- */

function LeaderCard({
  scenario,
  players,
  sim,
}: {
  scenario: Scenario;
  players: RosterPlayer[];
  sim: boolean;
}) {
  const { server, today } = scenario;
  const order = rankedAll(players);
  const leader = order[0];
  const second = order[1];
  const currentMap = today.maps.at(-1);
  const minutes =
    currentMap && currentMap.to === null ? minutesBetween(currentMap.from, today.clock) : null;
  if (!leader) return null;

  return (
    <section
      className="vs-score vs-leader"
      aria-labelledby="vs-score-title"
      data-kind="leader"
      data-testid="lider"
    >
      <div className="vs-score-top">
        <p id="vs-score-title" className="v-label vs-live">
          <StatusDot tone="online" pulse /> Líder agora
        </p>
        {minutes !== null ? (
          <p className="v-label vs-round">
            No mapa há <span className="vs-round-digits tabular-nums">{minutes}</span> min
          </p>
        ) : null}
      </div>

      <div key={leader.id} className="vs-leader-who">
        {leader.name === null ? (
          <>
            <span className="vs-anon vs-anon-lg">
              <span aria-hidden="true" className="vs-anon-disc" />
            </span>
            <span className="vs-leader-name vs-private">Jogador privado</span>
          </>
        ) : (
          <>
            <PlayerAvatar src={null} name={leader.name} size={56} playing />
            <Link href={`/${leader.publicId}` as never} className="vs-leader-name">
              {leader.name}
            </Link>
          </>
        )}
      </div>

      <div className="vs-leader-score">
        <span className="vs-score-digits v-sign">
          <Digits value={leader.score} />
        </span>
        <span className="vs-leader-stats">
          <span className="v-label">Pontos</span>
          <span className="tabular-nums">
            <Digits value={leader.kills} /> abates · <Digits value={leader.deaths} /> mortes
          </span>
        </span>
      </div>

      <p className="vs-score-cap">
        {second
          ? `${leader.score - second.score} ${leader.score - second.score === 1 ? 'ponto' : 'pontos'} à frente do segundo lugar`
          : 'Sozinho na liderança'}
      </p>

      <Slots count={players.length} max={server.maxPlayers} />
      {sim ? <p className="vs-sim v-label">Simulando abates</p> : null}
    </section>
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

/* ---------- jogadores ---------- */

function Roster({
  scenario,
  players,
  warmup,
}: {
  scenario: Scenario;
  players: RosterPlayer[];
  warmup: boolean;
}) {
  const { server } = scenario;
  const live = server.state !== 'offline';
  const dm = server.mode === 'deathmatch';

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
              ? 'Os jogadores aparecem aqui assim que alguém entrar.'
              : 'O servidor está offline. Os jogadores aparecem aqui quando ele voltar.'}
          </p>
        </div>
      ) : dm ? (
        <div className="vs-teams" data-single>
          <AllList players={rankedAll(players)} />
        </div>
      ) : (
        <div className="vs-teams">
          <TeamList
            side="ct"
            players={warmup ? alphabetical(players, 'ct') : ranked(players, 'ct')}
            warmup={warmup}
          />
          <TeamList
            side="t"
            players={warmup ? alphabetical(players, 't') : ranked(players, 't')}
            warmup={warmup}
          />
        </div>
      )}
    </section>
  );
}

function TeamList({
  side,
  players,
  warmup,
}: {
  side: Side;
  players: RosterPlayer[];
  warmup: boolean;
}) {
  return (
    <div className="vs-team-panel" data-side={side} data-warmup={warmup || undefined}>
      <div className="vs-team-head">
        <span className="vs-team-title">
          <span aria-hidden="true" className="vs-dot" />
          {SIDE_NAME[side]}
        </span>
        {warmup ? (
          <span className="vs-badge">
            <StatusDot tone="warn" pulse /> Esquentando
          </span>
        ) : (
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
        )}
      </div>
      <ul aria-label={SIDE_NAME[side]} className="vs-rows">
        {players.map((player, index) => (
          <PlayerRow
            key={player.id}
            player={player}
            rank={warmup ? null : index + 1}
            numbers={!warmup}
          />
        ))}
      </ul>
    </div>
  );
}

/** A lista única do Deathmatch: todos contra todos, por pontos. */
function AllList({ players }: { players: RosterPlayer[] }) {
  return (
    <div className="vs-team-panel" data-side="all">
      <div className="vs-team-head">
        <span className="vs-team-title">Todos contra todos · por pontos</span>
        <span className="vs-cols" data-cols="4" aria-hidden="true">
          <span>
            <span className="max-md:hidden">Abates</span>
            <span className="md:hidden">A</span>
          </span>
          <span>
            <span className="max-md:hidden">Mortes</span>
            <span className="md:hidden">M</span>
          </span>
          <span className="max-md:hidden">K/D</span>
          <span>
            <span className="max-md:hidden">Pontos</span>
            <span className="md:hidden">P</span>
          </span>
        </span>
      </div>
      <ul aria-label="Jogadores por pontos" className="vs-rows">
        {players.map((player, index) => (
          <PlayerRow key={player.id} player={player} rank={index + 1} numbers ratio />
        ))}
      </ul>
    </div>
  );
}

function PlayerRow({
  player,
  rank,
  numbers,
  ratio = false,
}: {
  player: RosterPlayer;
  rank: number | null;
  numbers: boolean;
  ratio?: boolean;
}) {
  return (
    <m.li
      layout="position"
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className="vs-row"
      data-private={player.name === null || undefined}
      data-first={rank === 1 || undefined}
      data-bare={rank === null || undefined}
      data-testid="jogador"
    >
      {rank !== null ? (
        <span className="vs-rank v-sign" aria-hidden="true">
          {rank}
        </span>
      ) : null}
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
      {numbers ? (
        <span className="vs-nums" data-cols={ratio ? '4' : undefined}>
          <Stat label="Abates" value={player.kills} />
          <Stat label="Mortes" value={player.deaths} />
          {ratio ? (
            <span className="vs-stat vs-ratio max-md:hidden tabular-nums">
              <span className="sr-only">Abates por morte </span>
              {(player.kills / Math.max(1, player.deaths)).toFixed(2)}
            </span>
          ) : null}
          <Stat label="Pontos" value={player.score} strong />
        </span>
      ) : null}
    </m.li>
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
  dm,
  art,
}: {
  today: Today;
  live: boolean;
  dm: boolean;
  art: Record<string, ArtPair>;
}) {
  const { rounds } = today;
  const sides = rounds.ctWins !== null && rounds.tWins !== null;
  const ctShare = sides && rounds.played > 0 ? ((rounds.ctWins ?? 0) / rounds.played) * 100 : 50;
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

      <div className="vs-tiles" data-n={dm ? 3 : 4}>
        {dm ? (
          <div className="vs-tile">
            <p className="v-label">Mapas hoje</p>
            <p className="vs-tile-num v-serif">
              <Ticker value={today.maps.length} />
            </p>
            <p className="vs-tile-foot">
              <span className="tabular-nums">{rounds.played}</span> rounds jogados
            </p>
          </div>
        ) : (
          <>
            <div className="vs-tile">
              <p className="v-label">Rounds jogados</p>
              <p className="vs-tile-num v-serif">
                <Ticker value={rounds.played} />
              </p>
              <p className="vs-tile-foot">
                em <span className="tabular-nums">{today.maps.length}</span> mapas
              </p>
            </div>
            <div className="vs-tile">
              <p className="v-label">Rounds ganhos</p>
              <p className="vs-tile-num v-serif tabular-nums">
                <span data-side="ct">{rounds.ctWins}</span>
                <span aria-hidden="true" className="vs-tile-x">
                  ×
                </span>
                <span data-side="t">{rounds.tWins}</span>
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
          </>
        )}
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
          <h3 className="vs-card-title">Mapas de hoje</h3>
          <ol className="vs-maps">
            {[...today.maps].reverse().map((row) => {
              const rowSlug = mapSlug(row.map) ?? '';
              const now = row.to === null;
              const hasSides = row.ctWins !== null && row.tWins !== null;
              const wins = (row.ctWins ?? 0) + (row.tWins ?? 0);
              const share = wins === 0 ? 50 : ((row.ctWins ?? 0) / wins) * 100;
              const warming = now && row.rounds === 0;
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
                    {now && live ? (
                      <span className="vs-now">
                        <StatusDot tone={warming ? 'warn' : 'online'} pulse />{' '}
                        {warming ? 'Esquentando' : 'Agora'}
                      </span>
                    ) : null}
                    {warming ? null : hasSides ? (
                      <>
                        <span>
                          <span className="sr-only">CT </span>
                          {row.ctWins}
                          <span aria-hidden="true" className="vs-map-x">
                            ×
                          </span>
                          <span className="sr-only"> TR </span>
                          {row.tWins}
                        </span>
                        <span className="vs-mini" aria-hidden="true">
                          <i data-side="ct" style={{ width: `${share}%` }} />
                          <i data-side="t" style={{ width: `${100 - share}%` }} />
                        </span>
                      </>
                    ) : null}
                    {warming ? null : <span className="vs-map-rounds">{row.rounds} rounds</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {dm ? null : (
            <p className="vs-card-foot">
              Rounds ganhos por lado em cada mapa. O Retake não tem partida: o mapa roda até a
              rotação.
            </p>
          )}
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
        {sim ? 'Parar simulação' : 'Simular'}
      </button>
    </nav>
  );
}
