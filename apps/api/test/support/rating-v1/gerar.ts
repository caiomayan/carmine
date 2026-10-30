/**
 * Gera a planilha de conferência da fórmula v1 (ADR 0029): `population.json` (a entrada),
 * `rounds-sample.json` (rounds de exemplo e o que a soma deles dá), `expected.json` (o que o oráculo
 * calcula) e os dois CSV para abrir no Excel.
 *
 *   node apps/api/test/support/rating-v1/gerar.ts
 *
 * Os dados são **sintéticos**: uma semente fixa e frequências plausíveis, não a medida de um servidor
 * real (a coleta por round ainda não rodou em produção). Servem para conferir a conta, não para
 * dizer quanto vale cada parte; isso se calibra com dado de verdade (ADR 0029, "O que ainda falta").
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateRounds,
  emptyCounts,
  IMPACT_POINTS,
  overall,
  PARTS,
  partRates,
  type RoundRow,
  rate,
  type SideCounts,
  sidePopulation,
} from './oracle.ts';

const dir = dirname(fileURLToPath(import.meta.url));

/** Gerador pseudoaleatório de semente fixa (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seeded(20261030);
const gauss = (): number =>
  Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const chance = (p: number): boolean => random() < p;

/** Um round de um jogador de habilidade `skill` (desvios acima da média da população). */
function simulateRound(side: 'ct' | 't', skill: number): RoundRow {
  const killChance = Math.max(0.02, 0.13 + 0.035 * skill + (side === 't' ? 0.01 : 0));
  let kills = 0;
  for (let i = 0; i < 5; i++) if (chance(killChance)) kills++;
  const survived = chance(Math.min(0.9, Math.max(0.1, 0.48 + 0.06 * skill)));
  const assist = chance(0.14);
  const traded = !survived && chance(0.22);
  const openingKill = kills > 0 && chance(0.2 + 0.04 * skill);
  const openingDeath = !survived && !openingKill && chance(0.2 - 0.02 * skill);
  const against = 1 + Math.floor(random() * 4);
  const clutch = chance(0.045);
  return {
    side,
    kills,
    damage: Math.round(kills * 72 + (survived ? 25 : 10) + random() * 30 + 6 * skill),
    survived,
    kast: kills > 0 || assist || survived || traded,
    openingKill,
    openingDeath,
    multiKill: kills >= 2 ? kills : null,
    clutchAgainst: clutch ? against : null,
    clutchWon: clutch
      ? chance(Math.min(0.9, Math.max(0.05, 0.4 + 0.08 * skill - 0.1 * against)))
      : null,
  };
}

function simulate(rounds: { ct: number; t: number }, skill: number) {
  const rows: RoundRow[] = [];
  for (const side of ['ct', 't'] as const) {
    for (let i = 0; i < rounds[side]; i++) rows.push(simulateRound(side, skill));
  }
  return aggregateRounds(rows);
}

interface Account {
  id: string;
  note: string;
  /** Rounds no Modo desde o início da coleta (a regra do "Calibrando n/100"). */
  lifetimeRounds: number;
  /** As contagens da janela de 90 dias. */
  ct: SideCounts;
  t: SideCounts;
}

const accounts: Account[] = [];
for (let i = 1; i <= 24; i++) {
  const ct = 110 + Math.floor(random() * 260);
  const t = 110 + Math.floor(random() * 260);
  const counts = simulate({ ct, t }, gauss());
  accounts.push({
    id: `c${String(i).padStart(2, '0')}`,
    note: 'população',
    lifetimeRounds: ct + t + Math.floor(random() * 150),
    ...counts,
  });
}

/** Casos de borda, com contagens escritas à mão (somando aos 24 acima, ficam todos na planilha). */
const specials: Account[] = [
  {
    id: 'x01',
    note: 'Calibrando 37/100',
    lifetimeRounds: 37,
    ...simulate({ ct: 19, t: 18 }, 2),
  },
  {
    id: 'x02',
    note: '130 rounds, 70 CT e 60 T: fora da população (menos de 100 por lado), mas com Rating',
    lifetimeRounds: 130,
    ...simulate({ ct: 70, t: 60 }, 0.5),
  },
  {
    id: 'x03',
    note: '400 rounds no total, só 12 na janela: o puxão pesa',
    lifetimeRounds: 400,
    ...simulate({ ct: 6, t: 6 }, 2.5),
  },
  {
    id: 'x04',
    note: '150 rounds só de CT: entra na população do CT e tem Rating só do CT',
    lifetimeRounds: 150,
    ...simulate({ ct: 150, t: 0 }, -0.5),
  },
  {
    id: 'x05',
    note: '200 rounds no total, nenhum na janela: sem Rating nos 90 dias',
    lifetimeRounds: 200,
    ct: emptyCounts(),
    t: emptyCounts(),
  },
];
accounts.push(...specials);

// A população: quem tem 100 rounds ou mais no lado (a x04 entra só no CT).
const population = {
  ct: sidePopulation(accounts.map((a) => a.ct)),
  t: sidePopulation(accounts.map((a) => a.t)),
};
if (!population.ct || !population.t) throw new Error('população pequena demais');

const results = accounts.map((a) => ({
  id: a.id,
  result: rate(a.lifetimeRounds, { ct: a.ct, t: a.t }, population),
}));

const ratedValues = results.flatMap((r) => (r.result.status === 'rated' ? [r.result.rating] : []));
const eligibleRated = accounts
  .map((a, i) => ({ a, r: results[i]?.result }))
  .filter(({ a, r }) => r?.status === 'rated' && (a.ct.rounds >= 100 || a.t.rounds >= 100));
const populationMean =
  eligibleRated.reduce((s, { r }) => s + (r?.status === 'rated' ? r.rating : 0), 0) /
  eligibleRated.length;

// Rating geral de exemplo: a c01 com o mesmo Rating no "5v5" (que ainda não existe) e no Retake.
const c01 = results[0]?.result;
const c01Rounds = accounts[0] ? accounts[0].ct.rounds + accounts[0].t.rounds : 0;
const overallExample =
  c01?.status === 'rated'
    ? overall([
        c01,
        { ...c01, rating: 1.1, rounds: c01Rounds * 2, shown: '1.10' },
        { status: 'calibrating', rounds: 40 },
      ])
    : null;

// Rounds de exemplo, para conferir a soma (a ponte entre o resumo do round e as contagens).
const r = (
  side: 'ct' | 't',
  kills: number,
  damage: number,
  survived: boolean,
  extra: Partial<RoundRow> = {},
): RoundRow => ({
  side,
  kills,
  damage,
  survived,
  kast: kills > 0 || survived,
  openingKill: false,
  openingDeath: false,
  multiKill: kills >= 2 ? kills : null,
  clutchAgainst: null,
  clutchWon: null,
  ...extra,
});
const sampleRows: RoundRow[] = [
  r('ct', 2, 168, true, { openingKill: true }),
  r('ct', 0, 35, false, { openingDeath: true, kast: false }),
  r('ct', 0, 20, false, { kast: true }), // morreu, mas foi trocado
  r('ct', 3, 240, true, { openingKill: true, clutchAgainst: 2, clutchWon: true }),
  r('ct', 1, 90, false),
  r('ct', 0, 0, true),
  r('t', 5, 410, true, { openingKill: true }),
  r('t', 1, 100, true, { clutchAgainst: 1, clutchWon: false }),
  r('t', 0, 60, false, { openingDeath: true, kast: false }),
  r('t', 2, 150, false, { clutchAgainst: 3, clutchWon: true }),
  r('t', 4, 330, true, { clutchAgainst: 1, clutchWon: true }),
  r('t', 0, 0, true),
];
const sample = { rows: sampleRows, counts: aggregateRounds(sampleRows) };

const write = (name: string, data: unknown) =>
  writeFileSync(join(dir, name), `${JSON.stringify(data, null, 2)}\n`);

write('population.json', { accounts });
write('rounds-sample.json', sample);
write('expected.json', {
  formulaVersion: 1,
  population,
  results,
  populationMean,
  overallExample,
});

// As planilhas, em CSV com ";" e vírgula decimal, que é como o Excel em português abre.
const num = (x: number, places = 4) => x.toFixed(places).replace('.', ',');
const csv = (lines: (string | number)[][]) => `﻿${lines.map((l) => l.join(';')).join('\r\n')}\r\n`;

const popLines: (string | number)[][] = [
  ['lado', 'contas', ...PARTS.flatMap((p) => [`média ${p}`, `desvio ${p}`])],
];
for (const side of ['ct', 't'] as const) {
  const p = population[side];
  if (!p) continue;
  popLines.push([
    side.toUpperCase(),
    p.accounts,
    ...PARTS.flatMap((part) => [num(p.mean[part]), num(p.sd[part])]),
  ]);
}
writeFileSync(join(dir, 'planilha-populacao.csv'), csv(popLines));

const header: (string | number)[] = ['conta', 'observação', 'rounds desde o início', 'situação'];
for (const side of ['CT', 'T']) {
  header.push(
    `${side} rounds`,
    `${side} abates`,
    `${side} sobreviveu`,
    `${side} KAST`,
    `${side} dano`,
    `${side} pontos de impacto`,
  );
}
for (const side of ['CT', 'T']) for (const part of PARTS) header.push(`${side} z ${part}`);
header.push(
  'Rating CT',
  'Rating T',
  'bruto',
  'rounds na janela',
  'Rating (cru)',
  'Rating mostrado',
);

const accountLines: (string | number)[][] = [header];
for (const [index, a] of accounts.entries()) {
  const res = results[index]?.result;
  if (!res) continue;
  const line: (string | number)[] = [a.id, a.note, a.lifetimeRounds, res.status];
  for (const c of [a.ct, a.t]) {
    line.push(
      c.rounds,
      c.kills,
      c.survivedRounds,
      c.kastRounds,
      c.damage,
      num(
        c.openingKills * IMPACT_POINTS.openingKill +
          c.openingDeaths * IMPACT_POINTS.openingDeath +
          c.mk2 * IMPACT_POINTS.multiKill[2] +
          c.mk3 * IMPACT_POINTS.multiKill[3] +
          c.mk4 * IMPACT_POINTS.multiKill[4] +
          c.mk5 * IMPACT_POINTS.multiKill[5] +
          c.cw1 * IMPACT_POINTS.clutchWon[1] +
          c.cw2 * IMPACT_POINTS.clutchWon[2] +
          c.cw3 * IMPACT_POINTS.clutchWon[3] +
          c.cw4 * IMPACT_POINTS.clutchWon[4] +
          c.cw5 * IMPACT_POINTS.clutchWon[5],
        1,
      ),
    );
  }
  for (const side of ['ct', 't'] as const) {
    for (const part of PARTS) {
      const z = res.status === 'rated' ? res.z[side]?.[part] : undefined;
      line.push(z === undefined ? '' : num(z));
    }
  }
  if (res.status === 'rated') {
    line.push(
      res.side.ct === undefined ? '' : num(res.side.ct),
      res.side.t === undefined ? '' : num(res.side.t),
      num(res.raw),
      res.rounds,
      num(res.rating, 6),
      res.shown.replace('.', ','),
    );
  } else {
    line.push(
      '',
      '',
      '',
      '',
      '',
      res.status === 'calibrating' ? `Calibrando ${res.rounds}/100` : '',
    );
  }
  accountLines.push(line);
}
writeFileSync(join(dir, 'planilha-contas.csv'), csv(accountLines));

console.log(
  `contas: ${accounts.length}; população CT ${population.ct.accounts}, T ${population.t.accounts}; ` +
    `média do Rating das elegíveis: ${populationMean.toFixed(4)}; Contas com Rating: ${ratedValues.length}`,
);
void partRates;
