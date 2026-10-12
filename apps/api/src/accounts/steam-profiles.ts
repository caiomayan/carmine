import { z } from 'zod';

/** O que a Steam diz publicamente de um perfil. */
export interface SteamSummary {
  /** Nome Steam atual. */
  personaName: string;
  /** URL do avatar (o maior). */
  avatarUrl: string;
}

/** Perfis públicos da Steam. */
export interface SteamProfiles {
  /** Resumo do perfil, `null` se ele não existe; rejeita se a Steam falhar. */
  summaryOf(steamId: string): Promise<SteamSummary | null>;
}

/** A lista de amigos Steam de alguém: os SteamID64 dos amigos, ou privada. */
export type SteamFriendList = { status: 'ok'; steamIds: string[] } | { status: 'private' };

/** Listas de amigos da Steam. */
export interface SteamFriends {
  /** Rejeita se a Steam falhar ou não responder a tempo. */
  friendsOf(steamId: string): Promise<SteamFriendList>;
}

const playerSummariesSchema = z.object({
  response: z.object({
    players: z.array(
      z.object({ steamid: z.string(), personaname: z.string(), avatarfull: z.url() }),
    ),
  }),
});

// Sem amigos, a Steam devolve um objeto vazio.
const friendListSchema = z.object({
  friendslist: z
    .object({ friends: z.array(z.object({ steamid: z.string() })).default([]) })
    .optional(),
});

export interface SteamWebApiOptions {
  key: string;
  url: string;
  timeoutMs: number;
}

/** `ISteamUser/GetPlayerSummaries/v2` e `ISteamUser/GetFriendList/v1` da Steam Web API. */
export class SteamWebApi implements SteamProfiles, SteamFriends {
  constructor(private readonly options: SteamWebApiOptions) {}

  async summaryOf(steamId: string): Promise<SteamSummary | null> {
    const url = new URL(`${this.options.url}/ISteamUser/GetPlayerSummaries/v2/`);
    url.searchParams.set('key', this.options.key);
    url.searchParams.set('steamids', steamId);

    // As mensagens de erro nunca incluem a URL, que leva a chave.
    const response = await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs) });
    if (!response.ok) {
      throw new Error(`Steam Web API respondeu HTTP ${response.status}`);
    }
    const body = playerSummariesSchema.parse(await response.json());
    const player = body.response.players.find((p) => p.steamid === steamId);
    return player ? { personaName: player.personaname, avatarUrl: player.avatarfull } : null;
  }

  async friendsOf(steamId: string): Promise<SteamFriendList> {
    const url = new URL(`${this.options.url}/ISteamUser/GetFriendList/v1/`);
    url.searchParams.set('key', this.options.key);
    url.searchParams.set('steamid', steamId);
    url.searchParams.set('relationship', 'friend');

    const response = await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs) });
    // A Steam responde 401 quando a lista de amigos da pessoa é privada.
    if (response.status === 401) {
      return { status: 'private' };
    }
    if (!response.ok) {
      throw new Error(`Steam Web API respondeu HTTP ${response.status}`);
    }
    const body = friendListSchema.parse(await response.json());
    return { status: 'ok', steamIds: body.friendslist?.friends.map((f) => f.steamid) ?? [] };
  }
}
