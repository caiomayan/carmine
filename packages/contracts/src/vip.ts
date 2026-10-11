import { z } from 'zod';
import type { Cs2Item } from './inventory.js';

/**
 * VIP da Conta da sessão (vem em `GET /api/me`). `endsAt` é o fim do Período VIP ativo; sem
 * Período ativo, `active` é falso e `endsAt` nulo.
 */
export const vipStatusSchema = z
  .object({
    active: z.boolean(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
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
