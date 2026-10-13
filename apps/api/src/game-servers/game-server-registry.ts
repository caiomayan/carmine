import {
  type GameMode,
  gameModeSchema,
  type ServerRegion,
  serverHostname,
} from '@carmine/contracts';
import { and, asc, eq, isNull, like } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { z } from 'zod';
import type { Database } from '../database/database.js';
import { gameServers } from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from '../staff/audit-log.js';
import { generateServerKey, hashServerKey } from './server-key.js';

/** Servidor Carmine (`GameServer`) como o resto da API o vê: nunca expõe o hash da chave. */
export interface GameServer {
  id: string;
  name: string;
  mode: GameMode;
  address: string;
  region: ServerRegion;
  /** Nome de vitrine (S07), ex.: "Retake · Rotação". */
  showcaseName: string | null;
  /** Código do servidor (S07), ex.: "SP·2". */
  code: string | null;
  keyRotatedAt: Date;
  createdAt: Date;
  /** Aposentado pelo CLI: fora da lista e sem chave válida; nulo em operação. */
  retiredAt: Date | null;
}

const registrationSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,31}$/, 'nome: de 2 a 32 letras minúsculas, números ou hífens'),
  mode: gameModeSchema,
  address: z
    .string()
    .regex(/^[a-z0-9.-]+:([1-9]\d{0,4})$/i, 'endereço: use host:porta (ex.: 203.0.113.10:27015)')
    .refine((value) => Number(value.split(':')[1]) <= 65_535, 'endereço: porta acima de 65535'),
});

export type GameServerRegistration = z.input<typeof registrationSchema>;

export class GameServerRegistryError extends Error {}

/** Outro Servidor Carmine já usa o código. */
export class ServerCodeTaken extends Error {
  constructor(code: string) {
    super(`o código ${code} já é de outro servidor`);
  }
}

/** O hostname do servidor no jogo, ou `null` enquanto faltar nome de vitrine ou código. */
export function hostnameOf(server: Pick<GameServer, 'showcaseName' | 'code'>): string | null {
  return server.showcaseName && server.code
    ? serverHostname(server.showcaseName, server.code)
    : null;
}

const publicColumns = {
  id: gameServers.id,
  name: gameServers.name,
  mode: gameServers.mode,
  address: gameServers.address,
  region: gameServers.region,
  showcaseName: gameServers.showcaseName,
  code: gameServers.code,
  keyRotatedAt: gameServers.keyRotatedAt,
  createdAt: gameServers.createdAt,
  retiredAt: gameServers.retiredAt,
};

const UNIQUE_VIOLATION = '23505';

/** Cadastro dos Servidores Carmine e das suas chaves (ADR 0005). */
export class GameServerRegistry {
  constructor(private readonly db: Database) {}

  /** Cadastra o servidor e devolve a chave em claro, que não fica guardada em lugar nenhum. */
  async register(input: GameServerRegistration): Promise<{ server: GameServer; key: string }> {
    const parsed = registrationSchema.safeParse(input);
    if (!parsed.success) {
      throw new GameServerRegistryError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const key = generateServerKey();
    try {
      const [server] = await this.db
        .insert(gameServers)
        .values({ ...parsed.data, keyHash: hashServerKey(key) })
        .returning(publicColumns);
      return { server: server as GameServer, key };
    } catch (error) {
      if (isUniqueViolation(error, 'game_servers_name_unique')) {
        throw new GameServerRegistryError(`Servidor "${parsed.data.name}" já existe`);
      }
      throw error;
    }
  }

  /** Troca a chave do servidor; a anterior para de funcionar na hora. */
  async rotateKey(name: string): Promise<string> {
    const key = generateServerKey();
    const updated = await this.db
      .update(gameServers)
      .set({ keyHash: hashServerKey(key), keyRotatedAt: new Date() })
      .where(and(eq(gameServers.name, name), isNull(gameServers.retiredAt)))
      .returning({ id: gameServers.id });
    if (updated.length === 0) {
      throw new GameServerRegistryError(`Servidor "${name}" não encontrado ou aposentado`);
    }
    return key;
  }

  /**
   * Aposenta servidores (por nome exato ou por prefixo do nome): saem da lista pública e do
   * painel e a chave para de valer, mas a linha fica (o log de auditoria aponta para ela) e o
   * nome continua reservado. Devolve os nomes aposentados agora (os já aposentados ficam fora).
   */
  async retire(match: { name: string } | { prefix: string }, now = new Date()): Promise<string[]> {
    const byName =
      'name' in match
        ? eq(gameServers.name, match.name)
        : like(gameServers.name, `${match.prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const retired = await this.db
      .update(gameServers)
      .set({ retiredAt: now })
      .where(and(byName, isNull(gameServers.retiredAt)))
      .returning({ name: gameServers.name });
    return retired.map((row) => row.name).sort();
  }

  /** O servidor dono da chave, ou `null` se ela não pertence a nenhum. */
  async authenticate(key: string): Promise<GameServer | null> {
    if (key === '') {
      return null;
    }
    const [server] = await this.db
      .select(publicColumns)
      .from(gameServers)
      .where(and(eq(gameServers.keyHash, hashServerKey(key)), isNull(gameServers.retiredAt)));
    return server ?? null;
  }

  /** Os servidores em operação (com `includeRetired`, também os aposentados), por nome. */
  async list({ includeRetired = false } = {}): Promise<GameServer[]> {
    return this.db
      .select(publicColumns)
      .from(gameServers)
      .where(includeRetired ? undefined : isNull(gameServers.retiredAt))
      .orderBy(asc(gameServers.name));
  }

  async find(id: string): Promise<GameServer | null> {
    const [server] = await this.db
      .select(publicColumns)
      .from(gameServers)
      .where(eq(gameServers.id, id));
    return server ?? null;
  }

  /**
   * Muda o nome de vitrine e o código (S07), com auditoria; o hostname muda no jogo no próximo
   * batimento. `null` se o servidor não existe; {@link ServerCodeTaken} se o código é de outro.
   */
  async updateShowcase(
    id: string,
    showcase: { showcaseName: string; code: string },
    staff: StaffAction,
    now = new Date(),
  ): Promise<GameServer | null> {
    try {
      return await this.db.transaction(async (tx) => {
        const [before] = await tx
          .select(publicColumns)
          .from(gameServers)
          .where(eq(gameServers.id, id))
          .for('update');
        if (!before) return null;
        const [after] = await tx
          .update(gameServers)
          .set(showcase)
          .where(eq(gameServers.id, id))
          .returning(publicColumns);
        await recordStaffAudit(tx, {
          action: 'server_update',
          staff,
          target: { serverId: id },
          details: {
            before: { showcaseName: before.showcaseName, code: before.code },
            after: showcase,
          },
          at: now,
        });
        return after ?? null;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'game_servers_code_unique')) {
        throw new ServerCodeTaken(showcase.code);
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause =
    error instanceof Error && error.cause instanceof DatabaseError ? error.cause : error;
  return (
    cause instanceof DatabaseError &&
    cause.code === UNIQUE_VIOLATION &&
    cause.constraint === constraint
  );
}
