import type { StaffSanction } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import {
  canRevoke,
  measureOptions,
  normalizeServerCode,
  sanctionGuard,
  sanctionState,
} from './staff';

const ME = '76561198000000001';
const OTHER = '76561198000000002';

describe('quem a Staff pode punir', () => {
  it('ninguém pune a si mesmo', () => {
    expect(sanctionGuard({ steamId: ME, role: 'owner' }, { steamId: ME, staffRole: 'owner' })).toBe(
      'self',
    );
  });

  it('jogador sem papel pode ser punido por qualquer papel', () => {
    for (const role of ['owner', 'admin', 'moderator'] as const) {
      expect(sanctionGuard({ steamId: ME, role }, { steamId: OTHER, staffRole: null })).toBe('ok');
    }
  });

  it('papel igual ou maior é protegido; o Dono pune qualquer outro', () => {
    const target = (staffRole: 'owner' | 'admin' | 'moderator') => ({ steamId: OTHER, staffRole });
    expect(sanctionGuard({ steamId: ME, role: 'moderator' }, target('moderator'))).toBe(
      'protected',
    );
    expect(sanctionGuard({ steamId: ME, role: 'admin' }, target('admin'))).toBe('protected');
    expect(sanctionGuard({ steamId: ME, role: 'admin' }, target('moderator'))).toBe('ok');
    expect(sanctionGuard({ steamId: ME, role: 'owner' }, target('owner'))).toBe('ok');
  });
});

const sanction = (over: Partial<StaffSanction> = {}): StaffSanction => ({
  id: '00000000-0000-4000-8000-000000000001',
  incidentId: '00000000-0000-4000-8000-000000000002',
  type: 'ban',
  category: 'griefing',
  reason: 'TK proposital na rodada 3',
  startsAt: '2026-10-12T15:00:00Z',
  endsAt: '2026-10-13T15:00:00Z',
  active: true,
  appliedBy: { steamId: OTHER, publicId: 2, displayName: 'Outra' },
  revocation: null,
  ...over,
});

describe('revogar Punição', () => {
  it('Admin e Dono revogam qualquer uma', () => {
    expect(canRevoke({ steamId: ME, role: 'admin' }, sanction())).toBe(true);
    expect(canRevoke({ steamId: ME, role: 'owner' }, sanction())).toBe(true);
  });

  it('Moderador só revoga as que aplicou', () => {
    expect(canRevoke({ steamId: ME, role: 'moderator' }, sanction())).toBe(false);
    expect(
      canRevoke(
        { steamId: ME, role: 'moderator' },
        sanction({ appliedBy: { steamId: ME, publicId: 1, displayName: 'Eu' } }),
      ),
    ).toBe(true);
  });
});

describe('estado de uma Punição no histórico da Staff', () => {
  it('em vigor, encerrada, registrada (kick/aviso), revogada e recurso aceito', () => {
    expect(sanctionState(sanction())).toBe('active');
    expect(sanctionState(sanction({ active: false }))).toBe('expired');
    expect(sanctionState(sanction({ type: 'warning', endsAt: null, active: false }))).toBe(
      'instant',
    );
    const revocation = {
      at: '2026-10-12T16:00:00Z',
      by: { steamId: ME, publicId: 1, displayName: 'Eu' },
      reason: 'Engano',
      appealAccepted: false,
    };
    expect(sanctionState(sanction({ active: false, revocation }))).toBe('revoked');
    expect(
      sanctionState(
        sanction({ active: false, revocation: { ...revocation, appealAccepted: true } }),
      ),
    ).toBe('appeal');
  });
});

describe('tipos de medida no formulário', () => {
  it('sem permissão de permanente, ban/mute/gag não oferecem "permanente"', () => {
    expect(measureOptions('moderator').permanent).toBe(false);
    expect(measureOptions('admin').permanent).toBe(true);
  });

  it('todos os papéis aplicam os cinco tipos', () => {
    expect(measureOptions('moderator').types).toEqual(['warning', 'kick', 'gag', 'mute', 'ban']);
  });
});

describe('código do servidor digitado pela Staff', () => {
  it('aceita ponto, hífen ou espaço no lugar do · e minúsculas', () => {
    expect(normalizeServerCode('sp.1')).toBe('SP·1');
    expect(normalizeServerCode('SP-12')).toBe('SP·12');
    expect(normalizeServerCode(' sp 2 ')).toBe('SP·2');
    expect(normalizeServerCode('SP·3')).toBe('SP·3');
  });

  it('o que não parece código fica como está (o contrato recusa)', () => {
    expect(normalizeServerCode('são paulo')).toBe('são paulo');
  });
});
