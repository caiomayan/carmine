import './zod-jitless.js';
import { z } from 'zod';
import type { Cs2Item } from './inventory.js';
import { planSchema } from './plans.js';

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
    /** O plano ativo agora (S20): Capo ou Padrinho; nulo sem plano. Ausente em respostas de antes da S20. */
    plan: planSchema.nullable().optional(),
    /** O trecho de agora é de teste do beta (ninguém paga de verdade). */
    test: z.boolean().optional(),
    /** Quando o plano de agora acaba ou muda (o Capo guardado volta depois do Padrinho); `endsAt` é o fim de tudo. */
    planEndsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .meta({ id: 'VipStatus' });

export type VipStatus = z.infer<typeof vipStatusSchema>;

/**
 * O aviso do fim do VIP ({@link vipNoticeAt}): `ending_soon` (até 3 dias, mas não hoje), `ending_today`
 * (acaba hoje) e `ended_today` (acabou hoje). Vai no site e, pelo connect, no chat do jogo.
 */
export const vipNoticeSchema = z.enum(['ending_soon', 'ending_today', 'ended_today']).meta({
  id: 'VipNotice',
});

export type VipNotice = z.infer<typeof vipNoticeSchema>;

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

export { VIP_ENDING_NOTICE_DAYS, VIP_NOTICE_TIME_ZONE, vipNoticeAt } from './rules.js';
