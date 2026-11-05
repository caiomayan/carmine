import { type Ranking, rankingSchema } from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';
import {
  seedPopulation,
  seedRetakeAccount,
  setCreatedAt,
  unitPopulation,
  zeroCounts,
} from './support/rating-surfaces.js';
import { installStableClock } from './support/stable-clock.js';

// Antes de qualquer `new Date()` do arquivo: sem cruzar a meia-noite de Brasília durante o teste.
installStableClock();

/**
 * S21 P4 (#239): o Ranking de Retake pelo Rating da semana, com a chave de transição.
 * Escritos ANTES do código (escritor de testes separado de quem implementa): falham hoje.
 *
 * Fontes: spec S21 ("Ranking de Retake passa a ordenar pelo Rating da semana, com o mesmo mínimo de 50
 * rounds. O DM continua por abates por minuto. Desempate: rounds jogados, depois a Conta mais antiga";
 * Aceite "O Ranking de Retake ordena pelo Rating da semana e continua exigindo 50 rounds"); ADR 0029
 * ("Arredondamento": ordena pelo valor já arredondado; "Janelas": Ranking = semana, com as médias de 90
 * dias, e o puxão a 50 rounds deixa o Rating a meio caminho de 1,00; "Consequences": o Ranking de Retake
 * mantém a ordenação de hoje até haver cobertura, decisão do maestro de 2026-10-29, "ADR do P4").
 *
 * O que a spec e o ADR NÃO fixam e estes testes ASSUMEM (perguntas no PR): o nome da chave
 * (`RANKING_RETAKE_BY_RATING`, variável de ambiente `true`/`false`) e o campo `rating` (2 casas) em
 * `RankingEntry`. Nenhum teste fixa o valor padrão da chave.
 *
 * População sintética de média 0 e desvio 1: o z de cada parte é a própria taxa por round, e só
 * `kills` e `damage` variam (as outras partes ficam em 0), então o Rating do lado é
 * `1 + 0,04 · (kills/round + dano/round)` (cada z limitado a ±3), e o Rating final é
 * `1 + (bruto − 1) · n / (n + 50)` (ADR 0029). Toda Conta tem 100 rounds ou mais na vida, para o
 * Calibrando não entrar na conversa.
 */

interface Spec {
  key: string;
  /** Rounds da semana (o `n` do puxão). */
  rounds: number;
  /** Taxa de abates e de dano por round (z da população unitária). */
  killsPerRound: number;
  damagePerRound: number;
  /** Rating esperado, 2 casas (conta feita à mão em cada caso). */
  rating: number;
  /** Rounds vencidos na semana: a ordenação de hoje. */
  roundsWon: number;
}

const ACCOUNTS: Spec[] = [
  // 200 rounds, bruto 1,196 → 1 + 0,196 · 0,8 = 1,1568 → 1,16 (exibido). Sem arredondar, ficaria atrás de B.
  { key: 'Z1', rounds: 200, killsPerRound: 2.9, damagePerRound: 2, rating: 1.16, roundsWon: 100 },
  // 200 rounds, bruto 1,20 → 1 + 0,20 · 0,8 = 1,16 exato. Empata com Z1 em 2 casas; Z1 é mais antiga.
  { key: 'B', rounds: 200, killsPerRound: 3, damagePerRound: 2, rating: 1.16, roundsWon: 100 },
  // 100 rounds, bruto 1,24 → 1 + 0,24 · 2/3 = 1,16. Empata com B e Z1 no Rating, perde nos rounds.
  { key: 'C', rounds: 100, killsPerRound: 3, damagePerRound: 3, rating: 1.16, roundsWon: 50 },
  // Igual a C em tudo; mais nova que C, então fica atrás dela (a Conta mais antiga desempata).
  { key: 'A', rounds: 100, killsPerRound: 3, damagePerRound: 3, rating: 1.16, roundsWon: 50 },
  // Exatamente 50 rounds (o mínimo): entra. Bruto 1,24 → 1 + 0,24 · 0,5 = 1,12.
  { key: 'E', rounds: 50, killsPerRound: 3, damagePerRound: 3, rating: 1.12, roundsWon: 25 },
  // 49 rounds: abaixo do mínimo, fora do Ranking mesmo com o melhor desempenho.
  { key: 'F', rounds: 49, killsPerRound: 3, damagePerRound: 3, rating: 1.12, roundsWon: 49 },
  // 300 rounds, bruto 1,08 → 1 + 0,08 · 300/350 = 1,0686 → 1,07.
  { key: 'D', rounds: 300, killsPerRound: 1, damagePerRound: 1, rating: 1.07, roundsWon: 150 },
  // 400 rounds sem nada: 1,00. Tem a MAIOR contagem de rounds vencidos (a ordenação de hoje).
  { key: 'G', rounds: 400, killsPerRound: 0, damagePerRound: 0, rating: 1.0, roundsWon: 380 },
];
/** A ordem esperada pelo Rating (só quem tem 50 rounds ou mais). */
const BY_RATING = ['Z1', 'B', 'C', 'A', 'E', 'D', 'G'];

async function seedWeek(t: TestApp): Promise<Map<string, number>> {
  await seedPopulation(t, unitPopulation);
  const publicIds = new Map<string, number>();
  const base = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [index, spec] of ACCOUNTS.entries()) {
    const who = await signedInPlayer(t, 8000 + index);
    publicIds.set(spec.key, who.account.publicId);
    // Z1 nasceu primeiro, depois B, C, A...: a ordem da lista é a idade (mais velha primeiro).
    await setCreatedAt(t, who.account.id, new Date(base + index * 60_000));
    await seedRetakeAccount(t, who.account.id, {
      ct: {
        ...zeroCounts,
        rounds: spec.rounds,
        kills: spec.killsPerRound * spec.rounds,
        damage: spec.damagePerRound * spec.rounds,
      },
      lifetimeRounds: spec.rounds + 150,
      roundsWon: spec.roundsWon,
    });
  }
  return publicIds;
}

function keysOf(ranking: Ranking, publicIds: Map<string, number>): string[] {
  const byPublicId = new Map([...publicIds].map(([key, id]) => [id, key]));
  return ranking.entries.flatMap((entry) => {
    const key = byPublicId.get(entry.player.publicId ?? 0);
    return key ? [key] : [];
  });
}

describe('Ranking de Retake pelo Rating da semana (chave de transição ligada)', () => {
  let t: TestApp;
  let publicIds: Map<string, number>;

  beforeAll(async () => {
    t = await startTestApp({ RANKING_RETAKE_BY_RATING: 'true' });
    publicIds = await seedWeek(t);
  });

  afterAll(async () => {
    await t?.stop();
  });

  const retake = async (): Promise<Ranking> => {
    await t.valkey.executeCliCmd('flushall');
    const response = await t.app.inject({ url: '/api/ranking/retake' });
    expect(response.statusCode, response.body).toBe(200);
    return rankingSchema.parse(response.json());
  };

  it('ordena pelo Rating da semana (2 casas); a ordem de hoje (rounds vencidos) deixa de valer', async () => {
    const ranking = await retake();

    expect(keysOf(ranking, publicIds)).toEqual(BY_RATING);
    // Guarda do próprio teste: a ordem por rounds vencidos seria outra (G, D, ... na frente).
    expect([...ACCOUNTS].sort((a, b) => b.roundsWon - a.roundsWon)[0]?.key).toBe('G');
  });

  it('cada linha traz o Rating da semana, o mesmo número que ordena', async () => {
    // Fonte: spec S21 "Ranking de Retake passa a ordenar pelo Rating da semana" (o número que ordena é o exibido).
    const ranking = await retake();

    for (const spec of ACCOUNTS.filter((a) => BY_RATING.includes(a.key))) {
      const entry = ranking.entries.find((e) => e.player.publicId === publicIds.get(spec.key));
      expect(entry?.rating, spec.key).toBe(spec.rating);
    }
  });

  it('o mínimo continua 50 rounds: 50 entra e 49 fica de fora, com o Rating alto que tiver', async () => {
    // Fonte: spec S21 "com o mesmo mínimo de 50 rounds" e Aceite "continua exigindo 50 rounds".
    const keys = keysOf(await retake(), publicIds);

    expect(keys).toContain('E');
    expect(keys).not.toContain('F');
  });

  it('ordena pelo valor já arredondado: 1,16 (exato) e 1,1568 empatam, e o desempate é rounds, depois a Conta mais antiga', async () => {
    // Fonte: ADR 0029 "Arredondamento" ("ordena pelo valor já arredondado ... desempata por rounds jogados e
    // depois pela Conta mais antiga") e spec S21 ("Desempate: rounds jogados, depois a Conta mais antiga").
    // Z1 (1,1568) e B (1,16) viram 1,16; os dois têm 200 rounds; Z1 é mais antiga, então vem antes de B
    // (ordenando pelo valor sem arredondar, B viria na frente). C e A (100 rounds) vêm depois dos de 200,
    // e C, mais antiga, antes de A.
    const keys = keysOf(await retake(), publicIds);

    expect(keys.slice(0, 4)).toEqual(['Z1', 'B', 'C', 'A']);
  });

  it('a posição do visitante usa a mesma ordem (a Conta A é a 4ª)', async () => {
    // Fonte: spec S19/S16 (`!rank` e card dizem a posição do Ranking); a posição não pode divergir da lista.
    await t.valkey.executeCliCmd('flushall');
    const who = await signedInPlayer(t, 8003);
    const response = await who.call('GET', '/api/ranking/retake');
    const ranking = rankingSchema.parse(response.json());

    expect(ranking.viewer?.entry?.position).toBe(BY_RATING.indexOf('A') + 1);
  });
});

describe('Ranking de Retake com a chave de transição desligada', () => {
  let t: TestApp;
  let publicIds: Map<string, number>;

  beforeAll(async () => {
    t = await startTestApp({ RANKING_RETAKE_BY_RATING: 'false' });
    publicIds = await seedWeek(t);
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('mantém a ordenação de hoje: rounds vencidos, mesmo com Rating pronto para todas as Contas', async () => {
    // Fonte: ADR 0029 "Consequences": "o Ranking de Retake mantém a ordenação de hoje até haver cobertura
    // (decisão do maestro, 2026-10-29; ADR do P4)". Hoje: rounds vencidos, depois K/D (apps/api/src/stats/ranking.ts).
    await t.valkey.executeCliCmd('flushall');
    const response = await t.app.inject({ url: '/api/ranking/retake' });
    expect(response.statusCode, response.body).toBe(200);
    const ranking = rankingSchema.parse(response.json());

    const keys = keysOf(ranking, publicIds);
    expect(keys.slice(0, 4)).toEqual(['G', 'D', 'B', 'Z1']); // 380, 150 e 100 (B tem K/D 6,0 e Z1 5,8)
    expect(keys).not.toEqual(BY_RATING);
    const scores = ranking.entries.map((entry) => entry.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(keys).not.toContain('F'); // o mínimo de 50 rounds é o mesmo
  });
});
