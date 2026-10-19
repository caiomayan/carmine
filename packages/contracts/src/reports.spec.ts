import { describe, expect, it } from 'vitest';
import {
  CHAT_TEXT_MAX,
  chatMessageEventSchema,
  createReportSchema,
  formatRetryAfter,
  REPORT_REASONS,
} from './reports.js';
import { countEvents, eventBatchSchema } from './stats.js';

const STEAM_ID = '76561198000000001';
const chat = {
  id: '0199f2a0-7b1c-7000-8000-000000000001',
  at: '2026-10-19T15:00:00.000-03:00',
  steamId: STEAM_ID,
  team: 'ct',
  teamChat: false,
  text: 'boa rodada',
};

describe('createReportSchema', () => {
  const report = {
    reporterSteamId: STEAM_ID,
    targetSteamId: '76561198000000002',
    reason: 'cheat',
    round: 7,
    map: 'de_nuke',
  };

  it('aceita todos os motivos do jogo', () => {
    for (const reason of REPORT_REASONS) {
      expect(createReportSchema.safeParse({ ...report, reason }).success).toBe(true);
    }
  });

  it('recusa motivo desconhecido e SteamID64 inválido', () => {
    expect(createReportSchema.safeParse({ ...report, reason: 'spam' }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...report, targetSteamId: '123' }).success).toBe(false);
  });

  it('round e mapa podem ser nulos (o plugin nem sempre sabe)', () => {
    expect(createReportSchema.safeParse({ ...report, round: null, map: null }).success).toBe(true);
  });
});

describe('o chat no lote de eventos', () => {
  it('uma mensagem de chat vale como evento e o lote antigo, sem o campo, continua válido', () => {
    const empty = { kills: [], damages: [], roundEnds: [], sessionStarts: [], sessionEnds: [] };
    expect(eventBatchSchema.safeParse(empty).success).toBe(true);
    const batch = eventBatchSchema.parse({ ...empty, chatMessages: [chat] });
    expect(countEvents(batch)).toBe(1);
  });

  it('recusa mensagem vazia, longa demais ou de lado desconhecido', () => {
    expect(chatMessageEventSchema.safeParse({ ...chat, text: '' }).success).toBe(false);
    expect(
      chatMessageEventSchema.safeParse({ ...chat, text: 'a'.repeat(CHAT_TEXT_MAX + 1) }).success,
    ).toBe(false);
    expect(chatMessageEventSchema.safeParse({ ...chat, team: 'gc' }).success).toBe(false);
  });
});

describe('formatRetryAfter', () => {
  it('mostra segundos abaixo de um minuto e minutos acima, sempre arredondando para cima', () => {
    expect(formatRetryAfter(1)).toBe('1 s');
    expect(formatRetryAfter(59)).toBe('59 s');
    expect(formatRetryAfter(60)).toBe('1 min');
    expect(formatRetryAfter(61)).toBe('2 min');
    expect(formatRetryAfter(600)).toBe('10 min');
  });
});
