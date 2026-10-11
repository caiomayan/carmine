import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';

/** `limit` requisições a cada `periodSeconds`, com rajada de até `limit`. */
export interface Quota {
  limit: number;
  periodSeconds: number;
}

export type RateLimitDecision =
  | {
      outcome: 'allowed';
      limit: number;
      /** Vagas que ainda restam agora. */
      remaining: number;
      /** Segundos até o balde ficar cheio de novo. */
      resetSeconds: number;
    }
  | {
      outcome: 'denied';
      limit: number;
      remaining: 0;
      /** Segundos até a próxima vaga (o `Retry-After`). */
      retryAfterSeconds: number;
      resetSeconds: number;
    }
  /** O Valkey não respondeu: quem chama decide se deixa passar (política da rota). */
  | { outcome: 'unavailable' };

const KEY_PREFIX = 'carmine:rate-limit:';

/**
 * GCRA (Generic Cell Rate Algorithm), o token bucket guardado como um único número: o TAT
 * (theoretical arrival time), o instante em que o balde estaria vazio. Cada requisição empurra
 * o TAT em um intervalo (período / limite); ela passa se o TAT novo não ficar mais de um
 * período à frente de agora. Tudo num script Lua, então ler, decidir e gravar é atômico
 * entre instâncias da API, e o relógio é o do Valkey (`TIME`), não o de cada instância.
 * Tempos em microssegundos (inteiros, cabem com folga no double do Lua).
 *
 * KEYS[1]: a chave do balde. ARGV[1]: intervalo de emissão (µs). ARGV[2]: período (µs).
 * Retorna {passou (1/0), vagas restantes, µs até a próxima vaga, µs até o balde encher}.
 */
const GCRA_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000000 + tonumber(time[2])
local interval = tonumber(ARGV[1])
local period = tonumber(ARGV[2])
local tat = tonumber(redis.call('GET', KEYS[1]) or now)
if tat < now then tat = now end
local new_tat = tat + interval
local allow_at = new_tat - period
if allow_at > now then
  return {0, 0, allow_at - now, tat - now}
end
redis.call('SET', KEYS[1], string.format('%d', new_tat), 'PX', math.ceil((new_tat - now) / 1000))
return {1, math.floor((period - (new_tat - now)) / interval), 0, new_tat - now}
`;
const GCRA_SHA = createHash('sha1').update(GCRA_SCRIPT).digest('hex');

/** Contador de requisições por chave no Valkey, compartilhado entre instâncias da API. */
export class RateLimiter {
  constructor(private readonly valkey: Redis) {}

  /** Gasta uma vaga do balde `key`, se houver. */
  async consume(key: string, quota: Quota): Promise<RateLimitDecision> {
    // Fora do ar (ou reconectando): responde na hora, sem esperar o timeout de cada comando.
    if (this.valkey.status !== 'ready') {
      return { outcome: 'unavailable' };
    }
    const periodUs = quota.periodSeconds * 1_000_000;
    const intervalUs = Math.max(1, Math.floor(periodUs / quota.limit));
    let result: [number, number, number, number];
    try {
      result = (await this.run(`${KEY_PREFIX}${key}`, intervalUs, periodUs)) as typeof result;
    } catch {
      return { outcome: 'unavailable' };
    }
    const [allowed, remaining, retryAfterUs, resetUs] = result;
    const resetSeconds = toSeconds(resetUs);
    if (allowed === 1) {
      return { outcome: 'allowed', limit: quota.limit, remaining, resetSeconds };
    }
    return {
      outcome: 'denied',
      limit: quota.limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, toSeconds(retryAfterUs)),
      resetSeconds,
    };
  }

  /** `EVALSHA`; na primeira vez de cada Valkey (ou depois de um restart), `EVAL`. */
  private async run(key: string, intervalUs: number, periodUs: number): Promise<unknown> {
    try {
      return await this.valkey.evalsha(GCRA_SHA, 1, key, intervalUs, periodUs);
    } catch (error) {
      if (!(error as Error).message.startsWith('NOSCRIPT')) {
        throw error;
      }
      return this.valkey.eval(GCRA_SCRIPT, 1, key, intervalUs, periodUs);
    }
  }
}

function toSeconds(microseconds: number): number {
  return Math.ceil(microseconds / 1_000_000);
}
