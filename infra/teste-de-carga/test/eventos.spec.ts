import { eventBatchSchema, serverHeartbeatSchema } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { criaServidor, steamIdDoJogador, totalDeEventos, uuidV7 } from '../lib/eventos.mjs';

/** Gerador determinístico (mulberry32) para o teste não depender da sorte. */
function semente(valor: number) {
  let a = valor;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T0 = Date.UTC(2026, 10, 4, 3, 0, 0);

describe('gerador de eventos do teste de carga', () => {
  it('o batimento passa no contrato do servidor', () => {
    const servidor = criaServidor({ indice: 7, rng: semente(1) });
    expect(serverHeartbeatSchema.safeParse(servidor.batimento()).success).toBe(true);
  });

  it('todas as descargas de uma hora de jogo passam no contrato, sem ID repetido', () => {
    const servidor = criaServidor({ indice: 3, rng: semente(2) });
    const ids = new Set<string>();
    let rounds = 0;
    let eventos = 0;
    for (let passo = 0; passo < 720; passo += 1) {
      const lote = servidor.descarga(T0 + passo * 5_000);
      const resultado = eventBatchSchema.safeParse(lote);
      expect(resultado.success, JSON.stringify(resultado.error?.issues)).toBe(true);
      expect(totalDeEventos(lote)).toBeLessThanOrEqual(500);
      for (const lista of Object.values(lote)) {
        for (const evento of lista as { id: string }[]) {
          expect(ids.has(evento.id)).toBe(false);
          ids.add(evento.id);
        }
      }
      rounds += lote.roundEnds.length;
      eventos += totalDeEventos(lote);
    }
    // Round de 75 s: uma hora tem 48 rounds. O modelo declarado no doc depende disto.
    expect(rounds).toBe(47);
    expect(eventos).toBeGreaterThan(48 * 20);
  });

  it('a primeira descarga abre o mapa: todos entram e o primeiro round começa', () => {
    const servidor = criaServidor({ indice: 1, rng: semente(3), jogadores: 10 });
    const lote = servidor.descarga(T0);
    expect(lote.sessionStarts).toHaveLength(10);
    expect(lote.roundStarts).toHaveLength(1);
    expect(lote.roundStarts[0].roundNumber).toBe(1);
    expect(lote.kills).toHaveLength(0);
  });

  it('um round fecha e o seguinte abre na mesma descarga, com o placar somando', () => {
    const servidor = criaServidor({ indice: 1, rng: semente(4) });
    servidor.descarga(T0);
    let fechou = null;
    for (let passo = 1; passo <= 15 && !fechou; passo += 1) {
      const lote = servidor.descarga(T0 + passo * 5_000);
      if (lote.roundEnds.length > 0) fechou = lote;
    }
    expect(fechou?.roundEnds[0].scoreCt + fechou?.roundEnds[0].scoreT).toBe(1);
    expect(fechou?.roundStarts[0].roundNumber).toBe(2);
  });

  it('servidores diferentes não dividem jogadores, e o bloco não é o da demonstração', () => {
    expect(steamIdDoJogador(1, 0)).not.toBe(steamIdDoJogador(2, 0));
    expect(steamIdDoJogador(1, 99)).not.toBe(steamIdDoJogador(2, 0));
    // A demonstração usa 76561199999000000 em diante.
    expect(BigInt(steamIdDoJogador(500, 99))).toBeLessThan(76561199999000000n);
  });

  it('UUID v7 tem a forma que o contrato aceita', () => {
    expect(uuidV7(T0, semente(5))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
