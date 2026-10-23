import { describe, expect, it } from 'vitest';
import { ACTIVITY_MAX_EVENTS, recentActivitySchema } from './activity.js';

const ID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';
const AT = '2026-10-22T18:00:00.000Z';
const player = { private: false, publicId: 10_003, displayName: 'fallen', avatarUrl: null };
const server = { id: ID, name: 'retake-1', showcaseName: null, code: 'SP·1', mode: 'retake' };

describe('recentActivitySchema', () => {
  it('aceita os quatro tipos de acontecimento', () => {
    const activity = {
      generatedAt: AT,
      events: [
        { id: ID, at: AT, type: 'joined', player, server },
        { id: ID, at: AT, type: 'multi_kill', player, server, kills: 5 },
        { id: ID, at: AT, type: 'new_leader', player, mode: 'deathmatch' },
        { id: ID, at: AT, type: 'skin_equipped', player, itemId: 222 },
      ],
    };

    expect(recentActivitySchema.parse(activity)).toEqual(activity);
  });

  it('o primeiro lugar pode ser anônimo (Perfil privado)', () => {
    const anonymous = {
      private: true,
      publicId: null,
      displayName: 'Jogador privado',
      avatarUrl: null,
    };

    expect(
      recentActivitySchema.safeParse({
        generatedAt: AT,
        events: [{ id: ID, at: AT, type: 'new_leader', player: anonymous, mode: 'retake' }],
      }).success,
    ).toBe(true);
  });

  it('multi-kill começa em 3 e o tipo é um dos quatro', () => {
    const base = { generatedAt: AT };

    expect(
      recentActivitySchema.safeParse({
        ...base,
        events: [{ id: ID, at: AT, type: 'multi_kill', player, server, kills: 2 }],
      }).success,
    ).toBe(false);
    expect(
      recentActivitySchema.safeParse({ ...base, events: [{ id: ID, at: AT, type: 'ping' }] })
        .success,
    ).toBe(false);
  });

  it('no máximo 20 eventos', () => {
    const event = { id: ID, at: AT, type: 'joined', player, server };

    expect(
      recentActivitySchema.safeParse({
        generatedAt: AT,
        events: Array(ACTIVITY_MAX_EVENTS + 1).fill(event),
      }).success,
    ).toBe(false);
  });
});
