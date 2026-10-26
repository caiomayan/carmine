'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ArtPair } from '@/components/vida/map-art';
import {
  advance,
  SCENARIO_KEYS,
  SCENARIOS,
  type ScenarioKey,
  type SimState,
} from '@/lib/server-page/fixtures';
import type { ServerExtras } from '@/lib/server-page/types';
import { ServerPageView } from './server-page-view';
import './dev-gallery.css';

/**
 * A vitrine de dev da página do servidor (/dev/servidor, só com CARMINE_UI_GALLERY=1): a página de verdade com os
 * dados de exemplo de cada estado, e uma barra para trocar de estado e simular rounds (o placar rola, a lista se
 * reordena). Serve para ver e testar os estados "prontos", que a API ainda não alimenta.
 */
export function DevGallery({
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
  const { extras } = scenario;
  const initialMatch = extras.match.status === 'ready' ? extras.match.data : null;
  const initialRoster = extras.roster.status === 'ready' ? extras.roster.data.players : [];
  const scoreboard = extras.roster.status === 'ready' ? extras.roster.data.scoreboard : false;
  const dm = scenario.server.mode === 'deathmatch';
  const canSim =
    scenario.server.state !== 'offline' &&
    extras.roster.status === 'ready' &&
    scoreboard &&
    initialRoster.length > 0 &&
    (dm || (initialMatch !== null && !initialMatch.warmup));

  const [sim, setSim] = useState(simFromUrl);
  const [game, setGame] = useState<SimState>({
    match: initialMatch,
    players: initialRoster,
    step: 0,
  });
  useEffect(() => {
    if (!sim || !canSim) return;
    const timer = setInterval(() => setGame((state) => advance(state)), simMs);
    return () => clearInterval(timer);
  }, [sim, canSim, simMs]);

  // Com a simulação ligada o placar e a lista vêm do estado simulado; o resto fica como o exemplo.
  const live: ServerExtras = canSim
    ? {
        ...extras,
        match: { status: 'ready', data: game.match },
        roster: { status: 'ready', data: { players: game.players, scoreboard: true } },
      }
    : extras;

  return (
    <>
      <ServerPageView server={scenario.server} extras={live} art={art} />
      {bar ? (
        <nav aria-label="Estados da vitrine" className="vs-bar v-glass">
          <span className="vs-bar-label">Vitrine de dev · dados de exemplo</span>
          <span className="vs-bar-states">
            {SCENARIO_KEYS.map((key) => (
              <Link
                key={key}
                href={`/dev/servidor?estado=${key}` as never}
                aria-current={key === scenarioKey ? 'page' : undefined}
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
            onClick={() => setSim((on) => !on)}
          >
            {sim ? 'Parar simulação' : 'Simular'}
          </button>
        </nav>
      ) : null}
    </>
  );
}
