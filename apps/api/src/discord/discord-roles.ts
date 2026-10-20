import type { StaffRole } from '@carmine/contracts';
import type { DiscordRoleKey } from '../config/config.js';

export type { DiscordRoleKey } from '../config/config.js';

/** O que decide os cargos de uma Conta com o Discord vinculado. */
export interface RoleFacts {
  /** Há um Período VIP ativo agora. */
  vipActive: boolean;
  staffRole: StaffRole | null;
}

/** Os cargos que a Conta deve ter: Jogador (todo vinculado), VIP, Staff (qualquer papel) e Dono. */
export function desiredRoleKeys({ vipActive, staffRole }: RoleFacts): DiscordRoleKey[] {
  const keys: DiscordRoleKey[] = ['player'];
  if (vipActive) keys.push('vip');
  if (staffRole !== null) keys.push('staff');
  if (staffRole === 'owner') keys.push('owner');
  return keys;
}

export interface RolePlan {
  /** IDs de cargo a dar. */
  add: string[];
  /** IDs de cargo a tirar. */
  remove: string[];
}

/**
 * Leva os cargos de `actual` ao desejado mexendo só nos cargos gerenciados (os que têm ID
 * configurado): os outros cargos da pessoa na comunidade não são do Carmine. Idempotente: com o
 * estado já certo, o plano é vazio.
 */
export function planRoles(
  roleIds: Partial<Record<DiscordRoleKey, string>>,
  desired: readonly DiscordRoleKey[],
  actual: ReadonlySet<string>,
): RolePlan {
  const wanted = new Set(desired.flatMap((key) => roleIds[key] ?? []));
  const managed = Object.values(roleIds);
  return {
    add: managed.filter((id) => wanted.has(id) && !actual.has(id)),
    remove: managed.filter((id) => !wanted.has(id) && actual.has(id)),
  };
}
