import type { SanctionType, StaffRole, StaffSanction } from '@carmine/contracts';
import { STAFF_ROLE_RANK, staffCan } from '@carmine/contracts/staff';

/**
 * Regras do painel da Staff (S07) que o painel antecipa para esconder ou explicar o que o papel não pode. A API decide de
 * verdade (as mesmas regras do contrato); aqui é só para não oferecer um botão que vai falhar.
 */
export type StaffViewer = { steamId: string; role: StaffRole };

/**
 * Pode punir esta Conta? Ninguém pune a si mesmo; papel igual ou maior é protegido, menos para o Dono, que pune qualquer
 * outro.
 */
export function sanctionGuard(
  viewer: StaffViewer,
  target: { steamId: string; staffRole: StaffRole | null },
): 'ok' | 'self' | 'protected' {
  if (viewer.steamId === target.steamId) return 'self';
  if (target.staffRole === null || viewer.role === 'owner') return 'ok';
  return STAFF_ROLE_RANK[viewer.role] > STAFF_ROLE_RANK[target.staffRole] ? 'ok' : 'protected';
}

/** Admin e Dono revogam qualquer Punição; o Moderador, só as que ele aplicou. */
export function canRevoke(viewer: StaffViewer, sanction: Pick<StaffSanction, 'appliedBy'>) {
  return (
    staffCan(viewer.role, 'sanctions.revokeAny') || sanction.appliedBy.steamId === viewer.steamId
  );
}

export type StaffSanctionState = 'active' | 'expired' | 'instant' | 'revoked' | 'appeal';

export function sanctionState(
  sanction: Pick<StaffSanction, 'type' | 'active' | 'revocation'>,
): StaffSanctionState {
  if (sanction.revocation) return sanction.revocation.appealAccepted ? 'appeal' : 'revoked';
  if (sanction.active) return 'active';
  return sanction.type === 'kick' || sanction.type === 'warning' ? 'instant' : 'expired';
}

export const SANCTION_STATE_LABEL: Record<StaffSanctionState, string> = {
  active: 'Em vigor',
  expired: 'Encerrada',
  instant: 'Registrada',
  revoked: 'Revogada',
  appeal: 'Recurso aceito',
};

/** Do mais leve ao mais pesado, a ordem do seletor de tipo. */
const MEASURE_TYPES: SanctionType[] = ['warning', 'kick', 'gag', 'mute', 'ban'];

export function measureOptions(role: StaffRole) {
  return { types: MEASURE_TYPES, permanent: staffCan(role, 'sanctions.applyPermanent') };
}
