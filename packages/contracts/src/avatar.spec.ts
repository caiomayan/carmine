import { describe, expect, it } from 'vitest';
import {
  AVATAR_ERROR_CODES,
  AVATAR_ERROR_STATUS,
  AVATAR_HISTORY_SIZE,
  AVATAR_INELIGIBLE_REASONS,
  AVATAR_REASON_LABELS,
  AVATAR_REASONS,
  avatarDecisionInputSchema,
  avatarReportInputSchema,
  avatarStateSchema,
  avatarVariantUrl,
  staffAccountAvatarSchema,
  staffAvatarCasePageSchema,
} from './avatar.js';
import { STAFF_PERMISSIONS, staffCan } from './staff.js';

const ID = '3f9c8b1e-7a52-4c1e-9d3a-2f6a8e0b4c11';
const URL_512 = `https://img.stcarmine.com/avatars/${ID}/512.webp`;
const variant = (size: number) => `https://img.stcarmine.com/avatars/${ID}/${size}.webp`;

describe('avatarVariantUrl', () => {
  it('escolhe o menor tamanho gerado que cobre o pedido', () => {
    expect(avatarVariantUrl(URL_512, 20)).toBe(variant(64));
    expect(avatarVariantUrl(URL_512, 64)).toBe(variant(64));
    expect(avatarVariantUrl(URL_512, 80)).toBe(variant(128));
    expect(avatarVariantUrl(URL_512, 296)).toBe(variant(512));
  });

  it('acima do maior tamanho, fica o maior', () => {
    expect(avatarVariantUrl(URL_512, 2000)).toBe(URL_512);
  });

  it('a URL da Steam passa intacta', () => {
    const steam = 'https://avatars.steamstatic.com/abc_full.jpg';

    expect(avatarVariantUrl(steam, 40)).toBe(steam);
  });
});

describe('avatarStateSchema', () => {
  const state = {
    enabled: true,
    source: 'steam',
    steamAvatarUrl: null,
    custom: null,
    history: [],
    canUseHistory: true,
    canUpload: true,
    cannotUploadReason: null,
    retryAfter: null,
    removal: null,
  };

  it('aceita o estado de uma Conta sem foto própria e o de uma com foto suspensa', () => {
    expect(avatarStateSchema.parse(state)).toEqual(state);
    const suspended = {
      ...state,
      source: 'custom',
      custom: { url: URL_512, status: 'suspended', uploadedAt: '2026-10-26T12:00:00.000Z' },
    };
    expect(avatarStateSchema.parse(suspended)).toEqual(suspended);
  });

  it(`o histórico traz no máximo ${AVATAR_HISTORY_SIZE} fotos`, () => {
    const item = (n: number) => ({
      id: ID.replace('3f', n.toString(16).padStart(2, '0')),
      url: URL_512,
      uploadedAt: '2026-10-26T12:00:00.000Z',
      current: n === 0,
    });
    const history = Array.from({ length: AVATAR_HISTORY_SIZE }, (_, n) => item(n));

    expect(avatarStateSchema.safeParse({ ...state, history }).success).toBe(true);
    expect(
      avatarStateSchema.safeParse({ ...state, history: [...history, item(AVATAR_HISTORY_SIZE)] })
        .success,
    ).toBe(false);
  });

  it('os limites de envio não têm código de idade da Conta nem de limite diário', () => {
    expect(AVATAR_INELIGIBLE_REASONS).toEqual([
      'punished',
      'upload_blocked',
      'upload_limit',
      'upload_too_soon',
    ]);
  });

  it('rejeita um motivo de bloqueio que não existe', () => {
    expect(avatarStateSchema.safeParse({ ...state, cannotUploadReason: 'banido' }).success).toBe(
      false,
    );
  });
});

describe('erros', () => {
  it('todo código tem o seu HTTP e os de elegibilidade repetem os motivos', () => {
    expect(Object.keys(AVATAR_ERROR_STATUS).sort()).toEqual([...AVATAR_ERROR_CODES].sort());
    for (const reason of AVATAR_INELIGIBLE_REASONS) {
      expect(AVATAR_ERROR_CODES).toContain(reason);
    }
  });

  it('todo motivo de denúncia tem o seu rótulo', () => {
    expect(Object.keys(AVATAR_REASON_LABELS).sort()).toEqual([...AVATAR_REASONS].sort());
  });
});

describe('denúncia e decisão da Staff', () => {
  it('a denúncia leva só o motivo', () => {
    expect(avatarReportInputSchema.parse({ reason: 'sexual' })).toEqual({ reason: 'sexual' });
    expect(avatarReportInputSchema.safeParse({ reason: 'chato' }).success).toBe(false);
  });

  it('remover exige o motivo; manter não', () => {
    expect(
      avatarDecisionInputSchema.safeParse({ decision: 'remove', note: 'imagem imprópria' }).success,
    ).toBe(false);
    expect(
      avatarDecisionInputSchema.safeParse({
        decision: 'remove',
        reason: 'sexual',
        note: 'imagem imprópria',
        blockDays: 30,
      }).success,
    ).toBe(true);
    expect(
      avatarDecisionInputSchema.safeParse({ decision: 'keep', note: 'foto de jogo, sem problema' })
        .success,
    ).toBe(true);
  });

  it('o bloqueio é de 0 a 365 dias', () => {
    const body = { decision: 'remove', reason: 'hate', note: 'símbolo de ódio' };

    expect(avatarDecisionInputSchema.safeParse({ ...body, blockDays: 366 }).success).toBe(false);
    expect(avatarDecisionInputSchema.safeParse({ ...body, blockDays: -1 }).success).toBe(false);
  });

  it('a fila e a ficha da Conta aceitam o formato vazio', () => {
    expect(
      staffAvatarCasePageSchema.parse({ cases: [], nextCursor: null, openCount: 0 }).openCount,
    ).toBe(0);
    const account = { source: 'steam', current: null, uploadBlockedUntil: null, removals: [] };
    expect(staffAccountAvatarSchema.parse(account)).toEqual(account);
  });

  it('Dono, Admin e Moderador moderam fotos; quem não é da Staff, não', () => {
    expect(STAFF_PERMISSIONS['avatars.moderate']).toEqual(['owner', 'admin', 'moderator']);
    expect(staffCan('moderator', 'avatars.moderate')).toBe(true);
    expect(staffCan(null, 'avatars.moderate')).toBe(false);
  });
});
