import {
  type CurrentSession,
  currentSessionSchema,
  type Inventory,
  inventorySchema,
  type Loadout,
  loadoutSchema,
  type PresetList,
  type Profile,
  presetListSchema,
  profileSchema,
} from '@carmine/contracts';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { apiGet, VISITOR_IP_HEADER } from './api-base';

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

export const getProfile = cache(async (publicId: number): Promise<ProfileResult> => {
  try {
    const response = await apiGet(`/profiles/${publicId}`, { visitorIp: await visitorIp() });
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'found', profile: profileSchema.parse(await response.json()) };
  } catch {
    return { status: 'unavailable' };
  }
});
