import type { GameMode, RankingViewer } from '@carmine/contracts';
import type { StatsTotals } from './stats-formulas.js';

const MODE_NAME: Record<GameMode, string> = { retake: 'Retake', deathmatch: 'Deathmatch' };
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** O que a escolha da linha de boas-vindas enxerga de uma Conta num connect (S16). */
export interface GreetingFacts {
  mode: GameMode;
  displayName: string;
  /** A Conta já tem Estatísticas neste Modo (alguma semana); falso: Conta nova no Modo. */
  hasStatsInMode: boolean;
  /** A semana atual neste Modo. */
  week: StatsTotals | null;
  /** A posição ou o progresso da Conta no Ranking desta semana neste Modo. */
  viewer: RankingViewer | null;
  /** Os dias de Brasília da semana atual com atividade neste Modo. */
  days: readonly { day: string; roundsWon: number; kills: number }[];
  /** Tempo de jogo de sempre, todos os Modos. */
  totalSeconds: number;
  /** Servidor de Retake e a Conta está fora do sorteio da AWP: vale lembrar do `!awp`. */
  awpHint: boolean;
}

/** O aviso do `!awp` para quem está fora do sorteio da AWP no Retake (S16, decisão do dono 2026-10-29). */
export const AWP_HINT = '!awp coloca você no sorteio da AWP.';

export interface Curiosity {
  key: string;
  line: string;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * As curiosidades que se aplicam à Conta agora: a lista da v1 da S16, menos a arma com mais abates
 * da semana, porque o banco guarda as armas só de sempre (`account_weapon_stats`), não por semana.
 */
export function curiosities(facts: GreetingFacts): Curiosity[] {
  const found: Curiosity[] = [];
  const { mode, viewer, week } = facts;

  if (viewer?.progress) {
    const { unit, missing } = viewer.progress;
    const noun =
      unit === 'rounds' ? plural(missing, 'round', 'rounds') : plural(missing, 'minuto', 'minutos');
    found.push({
      key: 'to-ranking',
      line: `${missing === 1 ? 'Falta' : 'Faltam'} ${missing} ${noun} para você entrar no Ranking desta semana.`,
    });
  }
  if (viewer?.entry) {
    found.push({
      key: 'position',
      line: `Você está em ${viewer.entry.position}º no Ranking de ${MODE_NAME[mode]}.`,
    });
  }
  if (week && week.headshots > 0) {
    found.push({
      key: 'headshots',
      line: `Você fez ${week.headshots} ${plural(week.headshots, 'headshot', 'headshots')} esta semana.`,
    });
  }
  if (facts.days.length >= 2) {
    const value = (d: GreetingFacts['days'][number]) => (mode === 'retake' ? d.roundsWon : d.kills);
    const best = facts.days.reduce((a, b) => (value(b) > value(a) ? b : a));
    if (value(best) > 0) {
      const weekday = WEEKDAYS[new Date(`${best.day}T12:00:00Z`).getUTCDay()];
      const what =
        mode === 'retake'
          ? `${value(best)} ${plural(value(best), 'round vencido', 'rounds vencidos')}`
          : `${value(best)} ${plural(value(best), 'abate', 'abates')}`;
      found.push({
        key: 'best-day',
        line: `Seu melhor dia da semana foi ${weekday}, com ${what}.`,
      });
    }
  }
  if (facts.awpHint) found.push({ key: 'awp-hint', line: AWP_HINT });
  const hours = Math.floor(facts.totalSeconds / 3600);
  if (hours >= 1) {
    found.push({
      key: 'hours',
      line: `Você já jogou ${hours} ${plural(hours, 'hora', 'horas')} no Carmine.`,
    });
  }
  return found;
}

/**
 * A linha do primeiro connect de uma Conta: as boas-vindas com o aviso dos termos que o ADR 0007 pede
 * (base legal de legítimo interesse). Só esse connect leva o link; os seguintes mostram a curiosidade.
 * Quem está fora do sorteio da AWP no Retake ganha uma segunda linha, com o aviso do `!awp`.
 */
export function firstConnectGreeting(displayName: string, awpHint = false): string {
  const welcome = `Bem-vindo, ${displayName}. Ao jogar você concorda com os termos: stcarmine.com/terms`;
  return awpHint ? `${welcome}\n${AWP_HINT}` : welcome;
}

/**
 * A linha do connect: Conta nova no Modo recebe as boas-vindas; Conta com dados, uma curiosidade
 * sorteada entre as que se aplicam e diferente da última mostrada. Sem curiosidade nova, as
 * boas-vindas (nunca a mesma curiosidade duas vezes seguidas).
 */
export function pickGreeting(
  facts: GreetingFacts,
  lastKey: string | null,
  random: () => number = Math.random,
): { line: string; curiosityKey: string | null } {
  const welcome = { line: `Bem-vindo, ${facts.displayName}.`, curiosityKey: null };
  if (!facts.hasStatsInMode) return welcome;
  const options = curiosities(facts).filter((c) => c.key !== lastKey);
  const chosen = options[Math.floor(random() * options.length)];
  return chosen ? { line: chosen.line, curiosityKey: chosen.key } : welcome;
}
