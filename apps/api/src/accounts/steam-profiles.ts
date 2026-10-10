import { z } from 'zod';

/** Perfis públicos da Steam. */
export interface SteamProfiles {
  /** URL do avatar (o maior), `null` se o perfil não existe; rejeita se a Steam falhar. */
  avatarUrlOf(steamId: string): Promise<string | null>;
}

const playerSummariesSchema = z.object({
  response: z.object({
    players: z.array(z.object({ steamid: z.string(), avatarfull: z.url() })),
  }),
});

export interface SteamWebApiOptions {
  key: string;
  url: string;
  timeoutMs: number;
}

/** `ISteamUser/GetPlayerSummaries/v2` da Steam Web API. */
export class SteamWebApi implements SteamProfiles {
  constructor(private readonly options: SteamWebApiOptions) {}

  async avatarUrlOf(steamId: string): Promise<string | null> {
    const url = new URL(`${this.options.url}/ISteamUser/GetPlayerSummaries/v2/`);
    url.searchParams.set('key', this.options.key);
    url.searchParams.set('steamids', steamId);

    // As mensagens de erro nunca incluem a URL, que leva a chave.
    const response = await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs) });
    if (!response.ok) {
      throw new Error(`Steam Web API respondeu HTTP ${response.status}`);
    }
    const body = playerSummariesSchema.parse(await response.json());
    return body.response.players.find((player) => player.steamid === steamId)?.avatarfull ?? null;
  }
}
