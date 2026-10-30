import { describe, expect, it } from 'vitest';
import { canRevoke, measureOptions, sanctionGuard, sanctionState } from './staff-rules';

const viewer = (role: 'owner' | 'admin' | 'moderator') => ({ steamId: '1', role });

describe('quem pode punir quem', () => {
  it('ninguém pune a si mesmo, nem o Dono', () => {
    expect(sanctionGuard(viewer('owner'), { steamId: '1', staffRole: 'owner' })).toBe('self');
    expect(sanctionGuard(viewer('moderator'), { steamId: '1', staffRole: null })).toBe('self');
  });

  it('quem não é da Staff pode ser punido por qualquer papel', () => {
    for (const role of ['owner', 'admin', 'moderator'] as const) {
      expect(sanctionGuard(viewer(role), { steamId: '2', staffRole: null })).toBe('ok');
    }
  });

  it('papel igual ou maior é protegido, menos para o Dono', () => {
    expect(sanctionGuard(viewer('moderator'), { steamId: '2', staffRole: 'moderator' })).toBe(
      'protected',
    );
    expect(sanctionGuard(viewer('moderator'), { steamId: '2', staffRole: 'admin' })).toBe(
      'protected',
    );
    expect(sanctionGuard(viewer('admin'), { steamId: '2', staffRole: 'admin' })).toBe('protected');
    expect(sanctionGuard(viewer('admin'), { steamId: '2', staffRole: 'moderator' })).toBe('ok');
    expect(sanctionGuard(viewer('owner'), { steamId: '2', staffRole: 'admin' })).toBe('ok');
  });
});

describe('quem revoga', () => {
  const by = (steamId: string) => ({ appliedBy: { steamId, publicId: null, displayName: null } });

  it('Admin e Dono revogam qualquer uma; o Moderador, só as que ele aplicou', () => {
    expect(canRevoke(viewer('admin'), by('9'))).toBe(true);
    expect(canRevoke(viewer('owner'), by('9'))).toBe(true);
    expect(canRevoke(viewer('moderator'), by('9'))).toBe(false);
    expect(canRevoke(viewer('moderator'), by('1'))).toBe(true);
  });
});

describe('estado da Punição', () => {
  it('recurso aceito, revogada, em vigor, encerrada e instantânea', () => {
    const base = { type: 'ban' as const, active: false, revocation: null };
    expect(
      sanctionState({
        ...base,
        revocation: { appealAccepted: true } as never,
      }),
    ).toBe('appeal');
    expect(sanctionState({ ...base, revocation: { appealAccepted: false } as never })).toBe(
      'revoked',
    );
    expect(sanctionState({ ...base, active: true })).toBe('active');
    expect(sanctionState(base)).toBe('expired');
    expect(sanctionState({ ...base, type: 'kick' })).toBe('instant');
    expect(sanctionState({ ...base, type: 'warning' })).toBe('instant');
  });
});

describe('medidas que o papel oferece', () => {
  it('só Admin e Dono aplicam permanente; todos veem os cinco tipos, do mais leve ao mais pesado', () => {
    expect(measureOptions('moderator').permanent).toBe(false);
    expect(measureOptions('admin').permanent).toBe(true);
    expect(measureOptions('owner').permanent).toBe(true);
    expect(measureOptions('moderator').types).toEqual(['warning', 'kick', 'gag', 'mute', 'ban']);
  });
});
