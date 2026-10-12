import { describe, expect, it } from 'vitest';
import { RECIDIVISM_TABLE, sanctionMeasureSchema, suggestSanction } from './moderation.js';

const HOUR = 60;
const DAY = 24 * HOUR;

describe('suggestSanction (tabela de reincidência do dono)', () => {
  it('chat ofensivo escala de aviso a gag de 7 dias', () => {
    expect(suggestSanction('offensive_chat', 0).measures).toEqual([
      { type: 'warning', durationMinutes: null },
    ]);
    expect(suggestSanction('offensive_chat', 1).measures).toEqual([
      { type: 'gag', durationMinutes: HOUR },
    ]);
    expect(suggestSanction('offensive_chat', 2).measures).toEqual([
      { type: 'gag', durationMinutes: DAY },
    ]);
    expect(suggestSanction('offensive_chat', 3).measures).toEqual([
      { type: 'gag', durationMinutes: 7 * DAY },
    ]);
  });

  it('da 4ª ocorrência em diante, vale a última linha', () => {
    expect(suggestSanction('griefing', 9)).toEqual({
      offense: 10,
      measures: [{ type: 'ban', durationMinutes: 30 * DAY }],
    });
  });

  it('discriminação na 1ª é gag de 7 dias mais ban de 1 dia, e permanente na 3ª', () => {
    expect(suggestSanction('discrimination', 0).measures).toEqual([
      { type: 'gag', durationMinutes: 7 * DAY },
      { type: 'ban', durationMinutes: DAY },
    ]);
    expect(suggestSanction('discrimination', 2).measures).toEqual([
      { type: 'ban', durationMinutes: null },
    ]);
    expect(suggestSanction('discrimination', 5).measures).toEqual([
      { type: 'ban', durationMinutes: null },
    ]);
  });

  it('cheat, ameaça, doxxing e conta alternativa são ban permanente já na 1ª', () => {
    for (const category of ['cheat', 'threat', 'doxxing', 'ban_evasion'] as const) {
      expect(suggestSanction(category, 0)).toEqual({
        offense: 1,
        measures: [{ type: 'ban', durationMinutes: null }],
      });
    }
  });

  it('toda medida da tabela é válida pelo contrato', () => {
    for (const steps of Object.values(RECIDIVISM_TABLE)) {
      for (const measure of steps.flat()) {
        expect(sanctionMeasureSchema.safeParse(measure).success).toBe(true);
      }
    }
  });
});

describe('sanctionMeasureSchema', () => {
  it('kick e aviso não têm duração', () => {
    expect(sanctionMeasureSchema.safeParse({ type: 'kick', durationMinutes: 10 }).success).toBe(
      false,
    );
    expect(
      sanctionMeasureSchema.safeParse({ type: 'warning', durationMinutes: null }).success,
    ).toBe(true);
  });

  it('ban sem duração é permanente; com duração, até 1 ano', () => {
    expect(sanctionMeasureSchema.safeParse({ type: 'ban', durationMinutes: null }).success).toBe(
      true,
    );
    expect(
      sanctionMeasureSchema.safeParse({ type: 'ban', durationMinutes: 366 * DAY }).success,
    ).toBe(false);
  });
});
