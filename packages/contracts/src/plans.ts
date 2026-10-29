import './zod-jitless.js';
import { z } from 'zod';
import { PRESETS_FREE_LIMIT } from './rules.js';

/**
 * S20 · Planos Capo e Padrinho (ADR 0026). O "VIP" genérico vira dois planos com nome próprio; o termo
 * genérico é Plano. Este arquivo é o domínio: quais são, o que cada um custa e o limite de Presets.
 * Os endpoints e a tela chegam nos PRs seguintes da S20.
 *
 * **Nomes legados internos:** a tabela `vip_periods` e os IDs de pacote do Capo (`vip-1m`, `vip-3m`,
 * `vip-6m`) continuam como são, para o rollback de imagem seguir valendo. Eles nunca aparecem para o
 * usuário: nem na tela, nem no recibo, nem no e-mail, nem no título do item no Mercado Pago, nem no cargo.
 */

/** Os planos pagos, do menor para o maior. A Conta sem plano é a grátis (`null`, não um plano). */
export const PLANS = ['capo', 'padrinho'] as const;

export const planSchema = z.enum(PLANS).meta({ id: 'Plan' });

export type Plan = z.infer<typeof planSchema>;

/** Presets por plano: grátis 1, Capo 6, Padrinho 25. */
export const PRESETS_CAPO_LIMIT = 6;
export const PRESETS_PADRINHO_LIMIT = 25;

/** Quantos Presets a Conta pode ter com `plan` (`null` é a Conta grátis). */
export function presetLimitFor(plan: Plan | null): number {
  if (plan === 'padrinho') return PRESETS_PADRINHO_LIMIT;
  if (plan === 'capo') return PRESETS_CAPO_LIMIT;
  return PRESETS_FREE_LIMIT;
}

/**
 * Os pacotes: 1, 3 e 6 meses em cada plano (um mês são 30 dias). A duração é forma de pagamento, não plano.
 * Preço em centavos de real; vale o do momento da compra. 3 meses saem por cerca de 10% a menos e 6 por
 * cerca de 16%, nos dois planos. Os IDs do Capo são os do VIP de antes (nome legado interno).
 */
export const PLAN_PACKAGES = [
  { id: 'vip-1m', plan: 'capo', months: 1, days: 30, priceCents: 990 },
  { id: 'vip-3m', plan: 'capo', months: 3, days: 90, priceCents: 2690 },
  { id: 'vip-6m', plan: 'capo', months: 6, days: 180, priceCents: 4990 },
  { id: 'padrinho-1m', plan: 'padrinho', months: 1, days: 30, priceCents: 1990 },
  { id: 'padrinho-3m', plan: 'padrinho', months: 3, days: 90, priceCents: 5390 },
  { id: 'padrinho-6m', plan: 'padrinho', months: 6, days: 180, priceCents: 9990 },
] as const;

export const planPackageIdSchema = z
  .enum(PLAN_PACKAGES.map((p) => p.id) as unknown as [PlanPackageId, ...PlanPackageId[]])
  .meta({ id: 'PlanPackageId' });

export type PlanPackageId = (typeof PLAN_PACKAGES)[number]['id'];

export type PlanPackage = (typeof PLAN_PACKAGES)[number];

/** O pacote de um ID (que diz de qual plano ele é). */
export function planPackage(id: PlanPackageId): PlanPackage {
  return PLAN_PACKAGES.find((p) => p.id === id) as PlanPackage;
}

/** Os pacotes de um plano, do mais curto para o mais longo. */
export function packagesOf(plan: Plan): PlanPackage[] {
  return PLAN_PACKAGES.filter((p) => p.plan === plan);
}

/**
 * Planos de teste (beta): ninguém paga de verdade até o lançamento, e os planos de teste ativos acabam no dia
 * em que a cobrança real ligar, com o aviso ao jogador este tanto de dias antes. A data e o aviso entram
 * junto com a cobrança real; aqui só a regra e a agenda (`apps/api/src/plans/plan-timeline.ts`).
 */
export const PLAN_TEST_NOTICE_DAYS = 7;
