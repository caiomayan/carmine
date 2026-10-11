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

const playerSummariesSchema = z.object({
  response: z.object({
    players: z.array(
      z.object({ steamid: z.string(), personaname: z.string(), avatarfull: z.url() }),
    ),
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
}
