import { afterAll, vi } from 'vitest';

/**
 * Um "agora" que não cruza a meia-noite de Brasília durante o teste.
 *
 * Os testes de dia e de semana (Estatísticas detalhadas, Ranking, Resumo da semana, atividade, página do
 * servidor) guardam datas calculadas de um `new Date()` do começo do arquivo e depois comparam com o que a API
 * calcula com o relógio do momento da requisição. Quando a CI roda nas últimas horas do dia em São Paulo, um
 * lote com horário "agora + 2 h" ou uma requisição feita um segundo depois da virada cai no dia seguinte e a
 * asserção (de um dia só) falha, sem nenhum defeito no código.
 *
 * `installStableClock()` fixa o PONTO DE PARTIDA do relógio de Date do processo (a API roda no mesmo processo
 * do teste) numa hora do dia com folga até a meia-noite e deixa ele andar em tempo real. Nas 20 horas do dia
 * em que já havia folga, o relógio fica como é; nas últimas horas, volta no máximo `margin` para dentro do
 * mesmo dia. Só `Date` é falsificado: temporizadores e `performance.now()` seguem reais. Como a virada da semana
 * é também uma meia-noite de Brasília, a mesma folga protege os testes de semana.
 *
 * Para reproduzir o problema sem esperar a noite: `CARMINE_TEST_NOW=2026-10-28T02:58:00Z pnpm test:integration ...`
 * (23:58 em Brasília) faz o arquivo rodar como se fosse essa hora, com a mesma folga.
 */

/** Brasília é UTC-3 o ano todo desde 2019 (o mesmo `dayOf` do ranking). */
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
export const STABLE_CLOCK_MARGIN_MS = 4 * 60 * 60 * 1000;

/** O instante da próxima meia-noite de Brasília depois de `at`. */
export function nextBrasiliaMidnight(at: Date): Date {
  const shifted = new Date(at.getTime() - BRASILIA_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) +
      BRASILIA_OFFSET_MS,
  );
}

/**
 * `real`, ou, se faltar menos de `margin` para a meia-noite de Brasília, o instante `margin` antes dela (no
 * mesmo dia). Nunca devolve um instante depois de `real`.
 */
export function stableInstant(real: Date, margin = STABLE_CLOCK_MARGIN_MS): Date {
  const latest = nextBrasiliaMidnight(real).getTime() - margin;
  return new Date(Math.min(real.getTime(), latest));
}

/**
 * Chame no topo do arquivo de teste, ANTES de calcular qualquer `new Date()` de módulo. Restaura o relógio
 * ao fim do arquivo. Sem efeito (relógio real) fora das últimas horas do dia, salvo com `CARMINE_TEST_NOW`.
 */
export function installStableClock(margin = STABLE_CLOCK_MARGIN_MS): Date {
  const forced = process.env.CARMINE_TEST_NOW;
  const real = forced ? new Date(forced) : new Date();
  if (Number.isNaN(real.getTime())) throw new Error(`CARMINE_TEST_NOW inválido: ${forced}`);
  const target = stableInstant(real, margin);
  if (forced || target.getTime() !== real.getTime()) {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(target);
  }
  afterAll(() => {
    vi.useRealTimers();
  });
  return target;
}
