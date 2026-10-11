import { createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { z } from 'zod';

/** Sessão do site de uma Conta reivindicada. */
export interface Session {
  /** Id opaco que vai no cookie; no Valkey só fica o hash dele. */
  id: string;
  accountId: string;
  /** Token CSRF desta sessão: toda mutação o traz no cabeçalho `x-csrf-token`. */
  csrfToken: string;
  /** Até quando a sessão vale, renovada a cada uso (deslizante), mas nunca além do limite absoluto. */
  expiresAt: Date;
  /** A sessão nasceu do login que reivindicou a Conta (o primeiro login dela). */
  firstLogin: boolean;
}

export interface SessionOptions {
  /** Sem uso por esse tempo, a sessão expira. */
  idleTtlSeconds: number;
  /** Mesmo em uso, a sessão expira esse tempo depois do login. */
  absoluteTtlSeconds: number;
}

const recordSchema = z.object({
  accountId: z.uuid(),
  csrfToken: z.string().min(1),
  createdAt: z.number(),
  renewedAt: z.number(),
  // Sessões gravadas antes do campo existir não são de primeiro login.
  firstLogin: z.boolean().default(false),
});

type SessionRecord = z.infer<typeof recordSchema>;

const KEY_PREFIX = 'carmine:session:';

/**
 * Sessões no Valkey: o TTL nativo dá a expiração ociosa de graça, a renovação deslizante é um
 * `SET` com novo TTL e o logout é um `DEL` que vale na hora. Ninguém acha a sessão pelo dump do
 * Valkey: a chave é o SHA-256 do id (256 bits aleatórios), que só existe no cookie.
 *
 * Para não reescrever a sessão a cada requisição, ela só é renovada quando já passou 1/24 do
 * tempo ocioso desde a última renovação (com 14 dias, a cada 14 horas).
 */
export class SessionStore {
  constructor(
    private readonly valkey: Redis,
    private readonly options: SessionOptions,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(accountId: string, options: { firstLogin?: boolean } = {}): Promise<Session> {
    const id = randomToken();
    const now = this.now().getTime();
    const record: SessionRecord = {
      accountId,
      csrfToken: randomToken(),
      createdAt: now,
      renewedAt: now,
      firstLogin: options.firstLogin ?? false,
    };
    const ttl = this.ttlMs(record, now);
    await this.valkey.set(keyOf(id), JSON.stringify(record), 'PX', ttl);
    return toSession(id, record, now, ttl);
  }

  /**
   * A sessão do id, ou `null` se ela não existe, expirou ou foi encerrada. `renewed` diz se a
   * validade avançou (o cookie precisa ser regravado com a nova validade).
   */
  async read(id: string): Promise<{ session: Session; renewed: boolean } | null> {
    if (!/^[\w-]{43}$/.test(id)) {
      return null;
    }
    const key = keyOf(id);
    const [stored, remainingMs] = await this.valkey
      .multi()
      .get(key)
      .pttl(key)
      .exec()
      .then((results) => [results?.[0]?.[1], results?.[1]?.[1]] as [string | null, number]);
    const parsed = stored ? recordSchema.safeParse(JSON.parse(stored)) : null;
    if (!parsed?.success || remainingMs <= 0) {
      return null;
    }
    const record = parsed.data;
    const now = this.now().getTime();
    if (now - record.createdAt >= this.options.absoluteTtlSeconds * 1000) {
      await this.valkey.del(key);
      return null;
    }

    const renewEveryMs = (this.options.idleTtlSeconds * 1000) / 24;
    if (now - record.renewedAt < renewEveryMs) {
      return { session: toSession(id, record, now, remainingMs), renewed: false };
    }
    const renewedRecord = { ...record, renewedAt: now };
    const ttl = this.ttlMs(renewedRecord, now);
    // XX: uma sessão encerrada no meio do caminho não volta à vida.
    const updated = await this.valkey.set(key, JSON.stringify(renewedRecord), 'PX', ttl, 'XX');
    if (updated === null) {
      return null;
    }
    return { session: toSession(id, renewedRecord, now, ttl), renewed: true };
  }

  /** Encerra a sessão na hora (logout, rotação no login). */
  async destroy(id: string): Promise<void> {
    await this.valkey.del(keyOf(id));
  }

  /** Tempo ocioso, cortado pelo limite absoluto contado do login (em ms). */
  private ttlMs(record: SessionRecord, now: number): number {
    const untilAbsolute = record.createdAt + this.options.absoluteTtlSeconds * 1000 - now;
    return Math.max(1, Math.min(this.options.idleTtlSeconds * 1000, untilAbsolute));
  }
}

function toSession(id: string, record: SessionRecord, now: number, ttlMs: number): Session {
  return {
    id,
    accountId: record.accountId,
    csrfToken: record.csrfToken,
    expiresAt: new Date(now + ttlMs),
    firstLogin: record.firstLogin,
  };
}

/** 256 bits aleatórios em base64url (43 caracteres). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

function keyOf(id: string): string {
  return `${KEY_PREFIX}${createHash('sha256').update(id).digest('hex')}`;
}
