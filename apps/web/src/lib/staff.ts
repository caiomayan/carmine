import {
  type SanctionType,
  STAFF_ROLE_RANK,
  type StaffRole,
  type StaffSanction,
  staffCan,
} from '@carmine/contracts';

/**
 * Regras do painel da Staff (S07) que o web antecipa para esconder ou explicar o que o papel
 * não pode. A API decide de verdade (mesmas regras do contrato); aqui é só para não oferecer
 * um botão que vai falhar.
 */
export type StaffViewer = { steamId: string; role: StaffRole };

/**
 * Pode punir esta Conta? Ninguém pune a si mesmo; papel igual ou maior é protegido, menos para
 * o Dono, que pune qualquer outro.
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

/** Do mais leve ao mais pesado, a ordem do seletor de tipo. */
const MEASURE_TYPES: SanctionType[] = ['warning', 'kick', 'gag', 'mute', 'ban'];

export function measureOptions(role: StaffRole) {
  return { types: MEASURE_TYPES, permanent: staffCan(role, 'sanctions.applyPermanent') };
}

/**
 * O código como a Staff digita ("sp.1", "SP-1", "sp 1") no formato do contrato ("SP·1"): o `·`
 * não está no teclado. O que não parece um código volta como veio, para o contrato recusar.
 */
export function normalizeServerCode(input: string): string {
  const match = /^\s*([a-z]{2,3})\s*[.\-·\s]\s*(\d{1,2})\s*$/i.exec(input);
  return match ? `${match[1]?.toUpperCase()}·${match[2]}` : input.trim();
}
