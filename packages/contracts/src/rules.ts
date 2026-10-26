import type { LoadoutSide, LoadoutSlot } from './loadout.js';
import type { SanctionType } from './moderation.js';
import type { VipStatus } from './vip.js';

/**
 * Constantes e regras puras que o web usa no navegador. Ficam num módulo sem Zod, acessível por
 * `@carmine/contracts/rules`, para não levar o Zod ao bundle da primeira carga: o navegador
 * importa daqui (ou de `@carmine/contracts/auth`) e só carrega os schemas sob demanda. Os
 * módulos de cada domínio reexportam estes itens, então a API segue importando do índice.
 */

/** Nome do evento SSE da lista ao vivo (`live-servers.ts`) e quanto o EventSource espera para reconectar. */
export const LIVE_SERVERS_EVENT = 'servers';
export const LIVE_SERVERS_RETRY_MS = 3000;

/** Tipos de Punição que duram (com `endsAt`, ou permanentes); kick e aviso são instantâneos. */
export const LASTING_SANCTION_TYPES = ['ban', 'mute', 'gag'] as const satisfies SanctionType[];

export type LastingSanctionType = (typeof LASTING_SANCTION_TYPES)[number];

export function isLastingSanction(type: SanctionType): type is LastingSanctionType {
  return (LASTING_SANCTION_TYPES as readonly SanctionType[]).includes(type);
}

/**
 * Caminho do web com as regras de conduta e como recorrer (ticket no Discord, resposta em até
 * 72 h). As mensagens do jogo mostram `stcarmine.com` + este caminho.
 */
export const APPEAL_PATH = '/regras#recurso';

/** Prazo de resposta de um recurso. */
export const APPEAL_RESPONSE_HOURS = 72;

/** Presets no plano grátis (só o principal, que é o Loadout). */
export const PRESETS_FREE_LIMIT = 1;

/** Presets com Período VIP ativo, contando o principal. */
export const PRESETS_VIP_LIMIT = 20;

export const PRESET_NAME_MAX_LENGTH = 32;

/** Lado de um slot do Loadout. */
export const LOADOUT_SIDES = ['ct', 't'] as const;

/** Times da cs2-lib (`CS2Team`): 2 = TR, 3 = CT. */
const TEAM_SIDES: Record<number, LoadoutSide> = { 2: 't', 3: 'ct' };

/** O mínimo de um Item do catálogo da cs2-lib (`CS2EconomyItem`) para achar o slot. */
export interface SlotCatalogItem {
  type: string;
  modelKey?: string | undefined;
  /** `CS2Team[]`: 2 = TR, 3 = CT. */
  teams?: readonly number[] | undefined;
}

/**
 * Onde um Item do catálogo é equipado: o slot e os lados possíveis (`null` no music kit), ou
 * `null` se não é um Item equipável. É a mesma regra da API: o web pode oferecer só esses lados.
 */
export function loadoutSlotOf(
  item: SlotCatalogItem,
): { slot: LoadoutSlot; sides: LoadoutSide[] | null } | null {
  const sides = (item.teams ?? [])
    .map((team) => TEAM_SIDES[team])
    .filter((side): side is LoadoutSide => side !== undefined)
    .sort((a, b) => LOADOUT_SIDES.indexOf(a) - LOADOUT_SIDES.indexOf(b));
  switch (item.type) {
    case 'weapon':
      return item.modelKey ? { slot: `weapon_${item.modelKey}`, sides } : null;
    case 'melee':
      return { slot: 'knife', sides };
    case 'glove':
      return { slot: 'gloves', sides };
    case 'agent':
      return { slot: 'agent', sides };
    case 'musickit':
      return { slot: 'musicKit', sides: null };
    default:
      return null;
  }
}

/** Com quantos dias de antecedência o site avisa o fim do Período VIP. */
export const VIP_ENDING_NOTICE_DAYS = 3;

/** Fuso dos avisos: "hoje" é o dia no horário de Brasília. */
export const VIP_NOTICE_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Aviso do fim do VIP a mostrar em `now`:
 * - `ending_soon`: o VIP acaba em até {@link VIP_ENDING_NOTICE_DAYS} dias (mas não hoje);
 * - `ending_today`: acaba hoje (horário de Brasília);
 * - `ended_today`: acabou hoje;
 * - `null`: nenhum aviso.
 */
export function vipNoticeAt(
  vip: Pick<VipStatus, 'active' | 'endsAt' | 'endedAt'>,
  now: Date,
): 'ending_soon' | 'ending_today' | 'ended_today' | null {
  const today = dayIn(now);
  if (vip.active && vip.endsAt !== null) {
    const endsDay = dayIn(new Date(vip.endsAt));
    if (endsDay === today) return 'ending_today';
    return endsDay - today <= VIP_ENDING_NOTICE_DAYS ? 'ending_soon' : null;
  }
  if (vip.endedAt !== null && dayIn(new Date(vip.endedAt)) === today) return 'ended_today';
  return null;
}

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: VIP_NOTICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Número do dia (dias desde 1970) da data no fuso dos avisos. */
function dayIn(date: Date): number {
  return Math.round(Date.parse(`${dayFormat.format(date)}T00:00:00Z`) / 86_400_000);
}

/** Menor e maior SteamID64 de conta individual (universo público, tipo individual, instância 1). */
const MIN_INDIVIDUAL_STEAM_ID = 76561197960265729n;
const MAX_INDIVIDUAL_STEAM_ID = 76561202255233023n;

/** Os 17 dígitos de um SteamID64 de conta individual (a mesma regra do `steamId64Schema`). */
export function isSteamId64(value: string): boolean {
  if (!/^\d{17}$/.test(value)) return false;
  const id = BigInt(value);
  return id >= MIN_INDIVIDUAL_STEAM_ID && id <= MAX_INDIVIDUAL_STEAM_ID;
}

/**
 * Tamanho da busca da paleta (Ctrl+K, U3d): menos que o mínimo casaria metade das Contas e dos
 * Itens; mais que o máximo não é um nome (o Nome de exibição tem no máximo 24).
 */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 50;

/** Tamanho do Nome de exibição próprio, em caracteres depois de normalizado (S11). */
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 24;
/** A Conta troca o Nome de exibição no máximo uma vez a cada tantos dias (S11). */
export const DISPLAY_NAME_COOLDOWN_DAYS = 7;

/*
 * Foto de perfil própria (ADR 0022). Publica na hora e a moderação é depois (denúncia e Staff);
 * estas regras valem na API e no web.
 */
/** Os tamanhos (px) gerados de cada foto, em WebP: listas, menu, Perfil no celular e no desktop. */
export const AVATAR_SIZES = [64, 128, 256, 512] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];
/** Formatos aceitos no envio (conferidos pelos bytes, não pela extensão). O corpo é o arquivo cru. */
export const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** O recorte que o navegador envia: até este tamanho, entre estes lados e quase quadrado (2%). */
export const AVATAR_MAX_UPLOAD_BYTES = 1024 * 1024;
export const AVATAR_MIN_PX = 256;
export const AVATAR_MAX_PX = 1024;
export const AVATAR_SQUARE_TOLERANCE = 0.02;
/** Quantos envios por Conta em 24 h. */
export const AVATAR_UPLOADS_PER_DAY = 3;
/** Contas mais novas que isto (ou com Punição ativa) não enviam foto. */
export const AVATAR_MIN_ACCOUNT_AGE_HOURS = 24;
/** Contas diferentes que denunciam a mesma foto para ela sair do ar até a Staff decidir. */
export const AVATAR_REPORT_SUSPEND_THRESHOLD = 2;
/** Denúncias de foto por pessoa por hora. */
export const AVATAR_REPORTS_PER_HOUR = 5;
/** A Staff decide em até este prazo (aparece para a Staff no painel). */
export const AVATAR_REVIEW_DEADLINE_HOURS = 24;
/** Foto removida pela Staff fica guardada em privado por este tempo e depois é apagada. */
export const AVATAR_REMOVED_RETENTION_DAYS = 30;
/** Bloqueio de novos envios depois de uma remoção: a 1ª, e a reincidência dentro da janela. */
export const AVATAR_BLOCK_DAYS_FIRST = 7;
export const AVATAR_BLOCK_DAYS_REPEAT = 30;
export const AVATAR_REPEAT_WINDOW_DAYS = 90;
export const AVATAR_BLOCK_DAYS_MAX = 365;

/** A URL pública da foto própria termina em `/avatars/<id>/<tamanho>.webp`. */
const AVATAR_URL = /\/avatars\/([0-9a-f-]{36})\/(\d+)\.webp$/;

/**
 * A URL de um tamanho da foto. A foto própria troca o sufixo pelo menor tamanho gerado que
 * cobre `px` (use o tamanho do elemento vezes a densidade de tela); a da Steam passa intacta.
 */
export function avatarVariantUrl(url: string, px: number): string {
  const match = AVATAR_URL.exec(url);
  if (!match) return url;
  const size = AVATAR_SIZES.find((candidate) => candidate >= px) ?? AVATAR_SIZES.at(-1);
  return url.replace(AVATAR_URL, `/avatars/${match[1]}/${size}.webp`);
}
