import { randomUUID } from 'node:crypto';
import type { GameMode } from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

/**
 * O que a faixa de atividade guarda de cada acontecimento. Fica no Valkey com o id interno da
 * Conta (para o Perfil privado valer na hora da leitura, mesmo se a pessoa o ligar depois); a
 * resposta pública nunca o traz.
 */
export type StoredActivity =
  | { id: string; type: 'joined'; at: string; accountId: string; serverId: string }
  | {
      id: string;
      type: 'multi_kill';
      at: string;
      accountId: string;
      serverId: string;
      kills: number;
    }
  | { id: string; type: 'new_leader'; at: string; accountId: string; mode: GameMode }
  | { id: string; type: 'skin_equipped'; at: string; accountId: string; itemId: number };

/** Quem produz acontecimentos fala com isto; nunca falha (a faixa é um extra, não pode derrubar o jogo). */
export interface ActivityRecorder {
  joined(accountId: string, serverId: string, at: Date): Promise<void>;
  multiKill(accountId: string, serverId: string, kills: number, at: Date): Promise<void>;
  newLeader(accountId: string, mode: GameMode, at: Date): Promise<void>;
  skinEquipped(accountId: string, itemId: number, at: Date): Promise<void>;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Uma janela de silêncio: `[chave, segundos]`. */
type Throttle = [key: string, seconds: number];

const LIST_KEY = 'activity:v1';
/** A lista guarda os últimos acontecimentos, bem mais que os 20 da resposta (os privados saem). */
const LIST_LENGTH = 100;
/** Sem movimento por duas horas, a lista inteira some. */
const LIST_TTL_SECONDS = 2 * 60 * 60;
/** Evento que chega com mais atraso que isto (fila do plugin) não é "ao vivo": não entra. */
const MAX_LATENCY_MS = 10 * 60 * 1000;

/** Uma entrada por Conta a cada tanto, para a faixa não virar uma lista de reconexões. */
const JOIN_EVERY_SECONDS = 10 * 60;
const EQUIP_EVERY_SECONDS = 60;
const SAME_SKIN_EVERY_SECONDS = 60 * 60;
/** Um destaque de multi-kill por jogador por minuto (no Deathmatch alguém assim encheria a lista). */
const MULTI_KILL_EVERY_SECONDS = 60;
/** O primeiro lugar de um Modo é anunciado no máximo uma vez a cada tanto, mesmo numa disputa apertada. */
const LEADER_EVERY_SECONDS = 2 * 60;

/**
 * A faixa de atividade ao vivo da home (Marquee), no Valkey: uma lista curta dos últimos
 * acontecimentos. Gravar é "melhor esforço": com o Valkey fora, nada é gravado e nada falha.
 */
export class ActivityFeed implements ActivityRecorder {
  private readonly logger = new Logger(ActivityFeed.name);

  constructor(
    private readonly valkey: Redis,
    private readonly now: () => Date = () => new Date(),
  ) {}

  joined(accountId: string, serverId: string, at: Date): Promise<void> {
    return this.push(
      () => ({ type: 'joined', at: at.toISOString(), accountId, serverId }),
      [[`activity:throttle:join:${accountId}`, JOIN_EVERY_SECONDS]],
    );
  }

  multiKill(accountId: string, serverId: string, kills: number, at: Date): Promise<void> {
    return this.push(
      () => ({ type: 'multi_kill', at: at.toISOString(), accountId, serverId, kills }),
      [[`activity:throttle:multi:${accountId}`, MULTI_KILL_EVERY_SECONDS]],
    );
  }

  newLeader(accountId: string, mode: GameMode, at: Date): Promise<void> {
    return this.push(
      () => ({ type: 'new_leader', at: at.toISOString(), accountId, mode }),
      [[`activity:throttle:leader:${mode}`, LEADER_EVERY_SECONDS]],
    );
  }

  skinEquipped(accountId: string, itemId: number, at: Date): Promise<void> {
    return this.push(
      () => ({ type: 'skin_equipped', at: at.toISOString(), accountId, itemId }),
      [
        [`activity:throttle:equip:${accountId}`, EQUIP_EVERY_SECONDS],
        [`activity:throttle:skin:${accountId}:${itemId}`, SAME_SKIN_EVERY_SECONDS],
      ],
    );
  }

  /** Os acontecimentos guardados, do mais novo para o mais antigo. */
  async recent(): Promise<StoredActivity[]> {
    try {
      const rows = await this.valkey.lrange(LIST_KEY, 0, LIST_LENGTH - 1);
      return rows.flatMap((row) => {
        try {
          return [JSON.parse(row) as StoredActivity];
        } catch {
          return [];
        }
      });
    } catch (error) {
      this.logger.warn(`Leitura da atividade falhou: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Grava o acontecimento se passar pelas janelas de silêncio. As janelas só ficam tomadas se o
   * acontecimento foi mesmo gravado: qualquer falha devolve as que já tinham sido tomadas. Nunca
   * lança (a data inválida de um evento também não derruba quem chamou).
   */
  private async push(
    build: () => DistributiveOmit<StoredActivity, 'id'>,
    throttles: Throttle[],
  ): Promise<void> {
    const taken: string[] = [];
    try {
      const event = build();
      if (this.now().getTime() - Date.parse(event.at) > MAX_LATENCY_MS) return;
      for (const [key, seconds] of throttles) {
        // `NX`: só a primeira vez dentro da janela passa.
        if ((await this.valkey.set(key, '1', 'EX', seconds, 'NX')) === null) {
          await this.release(taken);
          return;
        }
        taken.push(key);
      }
      await this.valkey
        .multi()
        .lpush(LIST_KEY, JSON.stringify({ id: randomUUID(), ...event }))
        .ltrim(LIST_KEY, 0, LIST_LENGTH - 1)
        .expire(LIST_KEY, LIST_TTL_SECONDS)
        .exec();
    } catch (error) {
      await this.release(taken);
      this.logger.warn(`Gravação da atividade falhou: ${(error as Error).message}`);
    }
  }

  private async release(keys: string[]): Promise<void> {
    if (keys.length > 0) await this.valkey.del(...keys).catch(() => undefined);
  }
}
