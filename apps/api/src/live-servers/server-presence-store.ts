import { matchStateSchema, scoreboardEntrySchema } from '@carmine/contracts';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { ServerPresence } from './live-server-list.js';

const KEY_PREFIX = 'live:presence:';

/**
 * O último batimento fica mesmo depois de o servidor cair (a lista mostra "visto há X min");
 * o TTL só limpa o que sobra de um servidor descadastrado.
 */
const RETENTION_SECONDS = 7 * 24 * 60 * 60;

const storedSchema = z.object({
  map: z.string(),
  players: z.array(z.string()),
  maxPlayers: z.number(),
  at: z.iso.datetime(),
  // S12b: ausentes em presença guardada antes do plugin novo.
  match: matchStateSchema.nullish(),
  scoreboard: z.array(scoreboardEntrySchema).nullish(),
});

/** Presença dos Servidores Carmine no Valkey: o último batimento de cada um. */
export class ServerPresenceStore {
  constructor(private readonly valkey: Redis) {}

  async save(serverId: string, presence: ServerPresence): Promise<void> {
    const stored = { ...presence, at: presence.at.toISOString() };
    await this.valkey.set(KEY_PREFIX + serverId, JSON.stringify(stored), 'EX', RETENTION_SECONDS);
  }

  /** O último batimento de cada servidor que já mandou um. */
  async readAll(serverIds: string[]): Promise<Map<string, ServerPresence>> {
    const found = new Map<string, ServerPresence>();
    if (serverIds.length === 0) {
      return found;
    }
    const values = await this.valkey.mget(serverIds.map((id) => KEY_PREFIX + id));
    serverIds.forEach((id, index) => {
      const value = values[index];
      const parsed = value ? storedSchema.safeParse(JSON.parse(value)) : null;
      if (parsed?.success) {
        found.set(id, { ...parsed.data, at: new Date(parsed.data.at) });
      }
    });
    return found;
  }
}
