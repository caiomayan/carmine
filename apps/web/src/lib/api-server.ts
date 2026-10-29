import type {
  CurrentSession,
  HeaderPreviews,
  Inventory,
  LiveServerList,
  Loadout,
  LoadoutSide,
  PresetList,
  Profile,
  ProfileSeries,
  ProfileStats,
  Ranking,
  RecentActivity,
  ServerPlayers,
  ServerToday,
  WeekSummary,
} from '@carmine/contracts';
import { recentActivitySchema } from '@carmine/contracts/activity';
import type { AnalyticsPreference } from '@carmine/contracts/analytics';
import { headerPreviewsSchema } from '@carmine/contracts/header-previews';
import { inventorySchema } from '@carmine/contracts/inventory';
import { liveServerListSchema } from '@carmine/contracts/live-servers';
import { loadoutSchema, presetListSchema } from '@carmine/contracts/loadout';
import type { Purchase, VipPackages } from '@carmine/contracts/payments';
import { purchaseListSchema, purchaseSchema, vipPackagesSchema } from '@carmine/contracts/payments';
import { currentSessionSchema, profileSchema } from '@carmine/contracts/profile';
import { rankingSchema } from '@carmine/contracts/ranking';
import { serverPlayersSchema, serverTodaySchema } from '@carmine/contracts/server-detail';
import {
  profileSeriesSchema,
  profileStatsSchema,
  weekSummarySchema,
} from '@carmine/contracts/stats';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { apiGet, VISITOR_IP_HEADER } from './api-base';
import { parseAnalyticsPreference } from './api-guards';
import type { Mode } from './modes';

/**
 * Sessão e Perfil lidos pelos Server Components, repassando o cookie da sessão (ADR 0015). Um
 * `Set-Cookie` de renovação que a API mande aqui não chega ao navegador: quem renova a sessão
 * é o `/api/me` do navegador.
 */

/** O IP do visitante que o cloudflared entregou ao web (ver `VISITOR_IP_HEADER`). */
export async function visitorIp(): Promise<string | null> {
  return (await headers()).get(VISITOR_IP_HEADER);
}

/** Nome do cookie da sessão na API (`__Host-`, httpOnly); o web só o repassa. */
export const SESSION_COOKIE = '__Host-carmine_session';

/**
 * A sessão como o servidor a vê nesta requisição. `unknown` quando a API não respondeu: a
 * barra superior não afirma que a pessoa saiu e o navegador tenta de novo.
 */
export type ServerSession =
  | { status: 'authenticated'; session: CurrentSession }
  | { status: 'anonymous' }
  | { status: 'unknown' };

/** O cookie da sessão para repassar à API; nulo sem sessão. */
async function sessionCookie(): Promise<string | null> {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessionId ? `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}` : null;
}

export const getServerSession = cache(async (): Promise<ServerSession> => {
  const cookie = await sessionCookie();
  if (!cookie) return { status: 'anonymous' };
  try {
    const response = await apiGet('/me', { cookie, visitorIp: await visitorIp() });
    if (response.status === 401) return { status: 'anonymous' };
    if (!response.ok) return { status: 'unknown' };
    return { status: 'authenticated', session: currentSessionSchema.parse(await response.json()) };
  } catch {
    return { status: 'unknown' };
  }
});

/**
 * O Inventário da Conta da sessão. `unavailable` quando a API falhou: a página mostra o aviso,
 * nunca um Inventário vazio (Princípios transversais).
 */
export type InventoryResult =
  | { status: 'ok'; inventory: Inventory }
  | { status: 'anonymous' }
  | { status: 'unavailable' };

/** Leitura da Conta da sessão: sem sessão, `anonymous`; com a API fora, `unavailable`. */
type AccountRead<T> =
  | { status: 'ok'; data: T }
  | { status: 'anonymous' }
  | { status: 'unavailable' };

async function readAccount<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
): Promise<AccountRead<T>> {
  const cookie = await sessionCookie();
  if (!cookie) return { status: 'anonymous' };
  try {
    const response = await apiGet(path, { cookie, visitorIp: await visitorIp() });
    if (response.status === 401) return { status: 'anonymous' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'ok', data: schema.parse(await response.json()) };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * A preferência de análise de uso da Conta da sessão (A1d): `participate` (a chave de /settings) e `enabled`
 * (há análise ligada neste ambiente; desligada, a chave nem aparece). Sem sessão, `anonymous`.
 */
export const getAnalyticsPreference = cache(
  (): Promise<AccountRead<AnalyticsPreference>> =>
    readAccount('/me/analytics', {
      parse: (value) => {
        const preference = parseAnalyticsPreference(value);
        if (!preference) throw new Error('formato inesperado');
        return preference;
      },
    }),
);

export const getInventory = cache(async (): Promise<InventoryResult> => {
  const result = await readAccount('/inventory', inventorySchema);
  return result.status === 'ok' ? { status: 'ok', inventory: result.data } : result;
});

/** O Loadout (o Preset ativo) da Conta da sessão (S05). */
export const getLoadout = cache(
  (): Promise<AccountRead<Loadout>> => readAccount('/loadout', loadoutSchema),
);

/** Os Presets da Conta da sessão e o limite do plano (S05). */
export const getPresets = cache(
  (): Promise<AccountRead<PresetList>> => readAccount('/presets', presetListSchema),
);

export type ProfileResult =
  | { status: 'found'; profile: Profile }
  | { status: 'not-found' }
  | { status: 'unavailable' };

/**
 * O Perfil público. Repassa a sessão (se houver): o histórico de Punições só vem para quem está
 * logado; o visitante recebe só o selo das ativas.
 */
export const getProfile = cache(async (publicId: number): Promise<ProfileResult> => {
  try {
    const cookie = await sessionCookie();
    const response = await apiGet(`/profiles/${publicId}`, {
      ...(cookie && { cookie }),
      visitorIp: await visitorIp(),
    });
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'found', profile: profileSchema.parse(await response.json()) };
  } catch {
    return { status: 'unavailable' };
  }
});

/**
 * A lista de Servidores Carmine ao vivo como estava nesta requisição (S06): a home começa com
 * ela e o rodapé mostra o resumo. Nulo com a API fora: a home avisa e tenta o ao vivo; o rodapé
 * não afirma "0 servidores".
 */
export const getLiveServers = cache(async (): Promise<LiveServerList | null> => {
  try {
    const response = await apiGet('/servers', { visitorIp: await visitorIp() });
    if (!response.ok) return null;
    return liveServerListSchema.parse(await response.json());
  } catch {
    return null;
  }
});

/**
 * A faixa de atividade da home (público, sem sessão). Nulo com a API fora: a home segue sem a
 * faixa, que não é essencial e nunca vira um aviso de erro.
 */
export const getRecentActivity = cache(async (): Promise<RecentActivity | null> => {
  try {
    const response = await apiGet('/activity/recent', { visitorIp: await visitorIp() });
    if (!response.ok) return null;
    return recentActivitySchema.parse(await response.json());
  } catch {
    return null;
  }
});

/**
 * Os jogadores de um servidor agora (S12b; público). Nulo com a API fora ou enquanto a rota não responde (501): a
 * página mostra o bloco "coletando" em vez de uma lista inventada.
 */
export const getServerPlayers = cache(async (serverId: string): Promise<ServerPlayers | null> => {
  try {
    const response = await apiGet(`/servers/${serverId}/players`, { visitorIp: await visitorIp() });
    if (!response.ok) return null;
    return serverPlayersSchema.parse(await response.json());
  } catch {
    return null;
  }
});

/** O histórico do dia de um servidor (S12b; público). Nulo com a API fora ou enquanto a rota não responde. */
export const getServerToday = cache(async (serverId: string): Promise<ServerToday | null> => {
  try {
    const response = await apiGet(`/servers/${serverId}/today`, { visitorIp: await visitorIp() });
    if (!response.ok) return null;
    return serverTodaySchema.parse(await response.json());
  } catch {
    return null;
  }
});

/**
 * Os números da semana de todas as Contas (a faixa "Esta semana" da home; público, sem sessão). Nulo com a
 * API fora: a faixa some em vez de mostrar zeros.
 */
export const getWeekSummary = cache(async (): Promise<WeekSummary | null> => {
  try {
    const response = await apiGet('/stats/week', { visitorIp: await visitorIp() });
    if (!response.ok) return null;
    return weekSummarySchema.parse(await response.json());
  } catch {
    return null;
  }
});

/**
 * Leitura do painel da Staff (S07). `forbidden` (sem papel ou sem a permissão) vira 404 na
 * página: quem não é da Staff nem fica sabendo que o painel existe.
 */
export type StaffRead<T> =
  | { status: 'ok'; data: T }
  | { status: 'anonymous' }
  | { status: 'forbidden' }
  | { status: 'not-found' }
  | { status: 'unavailable' };

export async function readStaff<T>(
  path: `/staff/${string}`,
  schema: { parse: (value: unknown) => T },
): Promise<StaffRead<T>> {
  const cookie = await sessionCookie();
  if (!cookie) return { status: 'anonymous' };
  try {
    const response = await apiGet(path, { cookie, visitorIp: await visitorIp() });
    if (response.status === 401) return { status: 'anonymous' };
    if (response.status === 403) return { status: 'forbidden' };
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'ok', data: schema.parse(await response.json()) };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * O Ranking semanal de um Modo (S12). Repassa a sessão para o jogador ver a própria posição e o
 * progresso até o mínimo. `invalid-week` quando a URL traz uma semana que a API recusa.
 */
export type RankingResult =
  | { status: 'ok'; ranking: Ranking }
  | { status: 'invalid-week' }
  | { status: 'unavailable' };

export const getRanking = cache(
  async (mode: Mode, week: string | undefined): Promise<RankingResult> => {
    try {
      const cookie = await sessionCookie();
      const query = week ? `?week=${encodeURIComponent(week)}` : '';
      const response = await apiGet(`/ranking/${mode}${query}`, {
        ...(cookie && { cookie }),
        visitorIp: await visitorIp(),
      });
      if (response.status === 400) return { status: 'invalid-week' };
      if (!response.ok) return { status: 'unavailable' };
      return { status: 'ok', ranking: rankingSchema.parse(await response.json()) };
    } catch {
      return { status: 'unavailable' };
    }
  },
);

/** As Estatísticas do Perfil (S12); nulo com a API fora (o Perfil avisa, não mostra zeros). */
export const getProfileStats = cache(async (publicId: number): Promise<ProfileStats | null> => {
  try {
    const cookie = await sessionCookie();
    const response = await apiGet(`/profiles/${publicId}/stats`, {
      ...(cookie && { cookie }),
      visitorIp: await visitorIp(),
    });
    if (!response.ok) return null;
    return profileStatsSchema.parse(await response.json());
  } catch {
    return null;
  }
});

/** A série semanal do Perfil (V3); nula com a API fora (o Perfil segue só com as somas). */
export const getProfileSeries = cache(async (publicId: number): Promise<ProfileSeries | null> => {
  try {
    const cookie = await sessionCookie();
    const response = await apiGet(`/profiles/${publicId}/stats/weekly`, {
      ...(cookie && { cookie }),
      visitorIp: await visitorIp(),
    });
    if (!response.ok) return null;
    return profileSeriesSchema.parse(await response.json());
  } catch {
    return null;
  }
});

/**
 * As prévias dos painéis do header (U3e), com a sessão repassada (a parte pessoal só vem com ela).
 * `side` é o último lado do Loadout, que só o navegador sabe. Nulo com a API fora: o painel diz
 * que não carregou, não mostra vazio.
 */
export async function getHeaderPreviews(side: LoadoutSide): Promise<HeaderPreviews | null> {
  try {
    const cookie = await sessionCookie();
    const response = await apiGet(`/header-previews?side=${side}`, {
      ...(cookie && { cookie }),
      visitorIp: await visitorIp(),
    });
    if (!response.ok) return null;
    return headerPreviewsSchema.parse(await response.json());
  } catch {
    return null;
  }
}

/** As compras da Conta da sessão, da mais nova (S14b). Sem sessão, `anonymous`; com a API fora, `unavailable`. */
export const getPurchases = cache(
  (): Promise<AccountRead<Purchase[]>> =>
    readAccount('/me/purchases', {
      parse: (value) => purchaseListSchema.parse(value).purchases,
    }),
);

/**
 * Uma compra da Conta. Se ela está pendente, a API já pergunta ao provedor antes de responder: ler
 * de novo é o que faz a tela perceber o pagamento. `not-found` também para a de outra Conta.
 */
export type PurchaseResult =
  | { status: 'ok'; purchase: Purchase }
  | { status: 'not-found' }
  | { status: 'anonymous' }
  | { status: 'unavailable' };

export const getPurchase = cache(async (id: string): Promise<PurchaseResult> => {
  const cookie = await sessionCookie();
  if (!cookie) return { status: 'anonymous' };
  try {
    const response = await apiGet(`/me/purchases/${encodeURIComponent(id)}`, {
      cookie,
      visitorIp: await visitorIp(),
    });
    if (response.status === 401) return { status: 'anonymous' };
    if (response.status === 404 || response.status === 400) return { status: 'not-found' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'ok', purchase: purchaseSchema.parse(await response.json()) };
  } catch {
    return { status: 'unavailable' };
  }
});

/**
 * Os Pacotes VIP e se a cobrança está ligada (e se é o provedor de mentira); nulo com a API fora. Com sessão, a API diz
 * também se a Conta pode comprar (`eligibility`); sem ela, `eligibility` é nulo.
 */
export const getVipPackages = cache(async (): Promise<VipPackages | null> => {
  try {
    const cookie = await sessionCookie();
    const response = await apiGet('/vip/packages', {
      ...(cookie ? { cookie } : {}),
      visitorIp: await visitorIp(),
    });
    if (!response.ok) return null;
    return vipPackagesSchema.parse(await response.json());
  } catch {
    return null;
  }
});
