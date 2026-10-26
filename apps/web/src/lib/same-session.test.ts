import { describe, expect, it } from 'vitest';
import { isKnownSession, type KnownSession, sameJson } from './same-session';

const known: KnownSession = {
  status: 'authenticated',
  account: { publicId: 7, displayName: 'Lia', isPrivate: false, loadoutShowcase: { items: [] } },
  csrfToken: 'token',
  vip: { active: false, endsAt: null, endedAt: null },
  staffRole: null,
  sanctions: [],
  displayNameChange: { custom: false, nextChangeAt: null },
};
const body = { ...known, firstLogin: false, status: undefined };

describe('sameJson', () => {
  it('ignora a ordem das chaves e compara arrays em ordem', () => {
    expect(sameJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameJson({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameJson(null, {})).toBe(false);
    expect(sameJson([], {})).toBe(false);
  });
});

describe('isKnownSession', () => {
  it('reconhece a mesma sessão (o firstLogin do servidor não conta)', () => {
    expect(isKnownSession(known, body)).toBe(true);
  });

  it('não reconhece quando algo mudou: Punição nova, VIP, nome ou token', () => {
    expect(isKnownSession(known, { ...body, sanctions: [{ type: 'ban' }] })).toBe(false);
    expect(
      isKnownSession(known, { ...body, vip: { ...(known.vip as object), active: true } }),
    ).toBe(false);
    expect(
      isKnownSession(known, {
        ...body,
        account: { ...(known.account as object), displayName: 'Ana' },
      }),
    ).toBe(false);
    expect(isKnownSession(known, { ...body, csrfToken: 'outro' })).toBe(false);
  });

  it('só vale para quem já está autenticado e para um corpo que é objeto', () => {
    expect(isKnownSession({ ...known, status: 'unknown' }, body)).toBe(false);
    expect(isKnownSession(known, null)).toBe(false);
    expect(isKnownSession(known, 'x')).toBe(false);
  });
});
