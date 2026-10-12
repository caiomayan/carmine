import { describe, expect, it } from 'vitest';
import {
  applySanctionsSchema,
  isPermanentMeasure,
  serverCodeSchema,
  serverHostname,
  serverShowcaseNameSchema,
  staffCan,
} from './staff.js';

describe('staffCan', () => {
  it('só o Dono altera papéis', () => {
    expect(staffCan('owner', 'roles.manage')).toBe(true);
    expect(staffCan('admin', 'roles.manage')).toBe(false);
    expect(staffCan('moderator', 'roles.manage')).toBe(false);
  });

  it('o Moderador pune, mas não permanente, nem mexe em VIP ou servidores', () => {
    expect(staffCan('moderator', 'sanctions.apply')).toBe(true);
    expect(staffCan('moderator', 'sanctions.applyPermanent')).toBe(false);
    expect(staffCan('moderator', 'vip.manage')).toBe(false);
    expect(staffCan('moderator', 'servers.edit')).toBe(false);
  });

  it('quem não é da Staff não pode nada', () => {
    expect(staffCan(null, 'accounts.read')).toBe(false);
  });
});

describe('applySanctionsSchema', () => {
  const base = { category: 'discrimination', reason: 'xingamento racista no chat' } as const;

  it('aceita a ocorrência com gag e ban juntos', () => {
    const parsed = applySanctionsSchema.safeParse({
      ...base,
      measures: [
        { type: 'gag', durationMinutes: 10_080 },
        { type: 'ban', durationMinutes: 1_440 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('recusa o mesmo tipo duas vezes e motivo vazio', () => {
    const twice = [
      { type: 'ban', durationMinutes: 60 },
      { type: 'ban', durationMinutes: 120 },
    ];
    expect(applySanctionsSchema.safeParse({ ...base, measures: twice }).success).toBe(false);
    expect(
      applySanctionsSchema.safeParse({
        ...base,
        reason: '  ',
        measures: [{ type: 'kick', durationMinutes: null }],
      }).success,
    ).toBe(false);
  });
});

describe('isPermanentMeasure', () => {
  it('ban, mute ou gag sem duração; kick e aviso nunca', () => {
    expect(isPermanentMeasure({ type: 'ban', durationMinutes: null })).toBe(true);
    expect(isPermanentMeasure({ type: 'gag', durationMinutes: 60 })).toBe(false);
    expect(isPermanentMeasure({ type: 'kick', durationMinutes: null })).toBe(false);
  });
});

describe('nome de vitrine, código e hostname', () => {
  it('monta o hostname do jogo', () => {
    expect(serverHostname('Retake · Rotação', 'SP·2')).toBe('Carmine | Retake · Rotação | SP·2');
  });

  it('o código é região·número', () => {
    expect(serverCodeSchema.safeParse('SP·1').success).toBe(true);
    expect(serverCodeSchema.safeParse('SP-1').success).toBe(false);
    expect(serverCodeSchema.safeParse('sp·1').success).toBe(false);
    expect(serverCodeSchema.safeParse('SP·0').success).toBe(false);
  });

  it('o nome de vitrine não pode ter "|"', () => {
    expect(serverShowcaseNameSchema.safeParse('Retake · Mirage').success).toBe(true);
    expect(serverShowcaseNameSchema.safeParse('Retake | Mirage').success).toBe(false);
  });
});
