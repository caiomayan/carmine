import { Logger } from '@nestjs/common';
import type { Database } from '../database/database.js';
import { serverPresenceSamples } from '../database/schema.js';

const MINUTE_MS = 60_000;

/**
 * O amostrador de jogadores simultâneos (A1, ADR 0021, aprovado pelo dono em 2026-10-21): no máximo uma amostra por
 * minuto por Servidor Carmine, gravada de dentro do batimento, com a contagem de jogadores. É o que fecha a lacuna do
 * "mídia kit" (pico e média de jogadores simultâneos por dia e por Modo): a Presença vive no Valkey e não ficava
 * guardada. Sem dado pessoal: só o servidor, o minuto e quantos jogadores.
 *
 * Não depende do PostHog nem da chave de oposição (é um número agregado do serviço, não análise de uma pessoa).
 * Nunca atrapalha o batimento: uma falha no banco só perde aquela amostra. Com várias instâncias da API, a chave
 * `(server_id, at)` deixa só uma amostra por minuto.
 */
export class ServerPresenceSamples {
  private readonly logger = new Logger(ServerPresenceSamples.name);
  /** O último minuto gravado por servidor: evita uma ida ao banco por batimento (chegam a cada poucos segundos). */
  private readonly lastMinute = new Map<string, number>();
  private lastWarnAt = 0;

  constructor(private readonly db: Database) {}

  /** Grava a amostra do minuto de `at` se ainda não há uma deste servidor (neste processo). Nunca rejeita. */
  async record(serverId: string, players: number, at: Date): Promise<void> {
    const minute = Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS;
    if (this.lastMinute.get(serverId) === minute) return;
    this.lastMinute.set(serverId, minute);
    try {
      await this.db
        .insert(serverPresenceSamples)
        .values({ serverId, at: new Date(minute), players })
        .onConflictDoNothing();
    } catch (error) {
      // Tenta de novo no próximo batimento do mesmo minuto; avisa no máximo uma vez por minuto.
      this.lastMinute.delete(serverId);
      const now = Date.now();
      if (now - this.lastWarnAt > MINUTE_MS) {
        this.lastWarnAt = now;
        this.logger.warn(`Amostra de presença não gravada: ${(error as Error).message}`);
      }
    }
  }
}
