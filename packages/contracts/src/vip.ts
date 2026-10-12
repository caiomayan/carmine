import { z } from 'zod';
import type { Cs2Item } from './inventory.js';

/**
 * VIP da Conta da sessão (vem em `GET /api/me`). `endsAt` é o fim do Período VIP ativo (somando
 * os encadeados); sem Período ativo, `active` é falso e `endsAt` nulo. `endedAt` é o fim do
 * último Período quando não há VIP ativo (nulo com VIP ativo ou se nunca houve VIP): serve ao
 * aviso "seu VIP acabou hoje". Os avisos saem de {@link vipNoticeAt}.
 */
export const vipStatusSchema = z
  .object({
    active: z.boolean(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    endedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'VipStatus' });

export type VipStatus = z.infer<typeof vipStatusSchema>;

/** O que só entra no Inventário com Período VIP ativo. */
export type VipFeature = 'agent' | 'musicKit' | 'statTrak' | 'nameTag';

/**
 * O que, neste Item, exige VIP; vazio se o plano grátis cobre. `type` é o `CS2ItemType` da
 * cs2-lib do Item do catálogo (`CS2Economy.getById(item.id).type`). A API usa a mesma regra
 * para recusar com `vip_required`, então o cadeado do web nunca diverge do servidor.
 */
export function vipFeaturesOf(
  type: string,
  item: Pick<Cs2Item, 'statTrak' | 'nameTag'>,
): VipFeature[] {
  const features: VipFeature[] = [];
  if (type === 'agent') features.push('agent');
  if (type === 'musickit') features.push('musicKit');
  if (item.statTrak !== undefined) features.push('statTrak');
  if (item.nameTag !== undefined) features.push('nameTag');
  return features;
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
