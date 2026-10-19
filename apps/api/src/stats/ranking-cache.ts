import type { GameMode } from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { RankedRow } from './ranking.js';

/**
 * Quanto o Ranking de um Modo e semana fica no cache (ADR 0018, adendo): o Ranking é público e
 * a consulta soma a semana inteira, então 45 s absorvem rajadas sem o número parecer parado.
 */
export const RANKING_CACHE_TTL_SECONDS = 45;

/** O que se guarda por Modo e semana: a ordem inteira e as semanas consultáveis. */
export interface CachedRanking {
  ranked: RankedRow[];
  weeks: string[];
}

const key = (mode: GameMode, weekStart: string) => `ranking:v1:${mode}:${weekStart}`;

/**
 * Cache do Ranking semanal no Valkey. Guarda só números e IDs internos de Conta: nome, avatar e
 * Perfil privado são lidos na hora, então ativar o Perfil privado tira a pessoa do Ranking sem
 * esperar o cache. Com o Valkey fora, o Ranking só fica mais lento (lê do Postgres).
 */
export class RankingCache {
  private readonly logger = new Logger('RankingCache');

  constructor(private readonly valkey: Redis) {}

  async get(mode: GameMode, weekStart: string): Promise<CachedRanking | null> {
    try {
      const raw = await this.valkey.get(key(mode, weekStart));
      return raw === null ? null : (JSON.parse(raw) as CachedRanking);
    } catch (error) {
      this.logger.warn(`Leitura do cache falhou: ${(error as Error).message}`);
      return null;
    }
  }

  async set(mode: GameMode, weekStart: string, value: CachedRanking): Promise<void> {
    try {
      await this.valkey.set(
        key(mode, weekStart),
        JSON.stringify(value),
        'EX',
        RANKING_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(`Escrita no cache falhou: ${(error as Error).message}`);
    }
  }

  /** A Staff mexeu no Ranking: a próxima leitura recalcula. */
  async invalidate(mode: GameMode, weekStart: string): Promise<void> {
    try {
      await this.valkey.del(key(mode, weekStart));
    } catch (error) {
      this.logger.warn(`Invalidação do cache falhou: ${(error as Error).message}`);
    }
  }
}
