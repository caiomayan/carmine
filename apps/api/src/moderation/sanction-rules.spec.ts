import { describe, expect, it } from 'vitest';
import {
  gameSanctionMessage,
  isActiveAt,
  previousOffensesAt,
  type SanctionRecord,
  toProfileSanctions,
} from './sanction-rules.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// 12/10/2026 às 12h em Brasília (UTC-3).
const now = new Date('2026-10-12T15:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
const ahead = (days: number) => new Date(now.getTime() + days * DAY_MS);

let next = 0;
function sanction(fields: Partial<SanctionRecord>): SanctionRecord {
  next++;
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
    incidentId: `10000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
    type: 'ban',
    category: 'griefing',
    startsAt: ago(1),
    endsAt: ahead(1),
    revokedAt: null,
    appealAccepted: false,
    ...fields,
  };
}

describe('isActiveAt', () => {
  it('ban, mute e gag valem até endsAt; permanente vale sempre', () => {
    expect(isActiveAt(sanction({ endsAt: ahead(1) }), now)).toBe(true);
    expect(isActiveAt(sanction({ endsAt: ago(0.5) }), now)).toBe(false);
    expect(isActiveAt(sanction({ endsAt: null }), now)).toBe(true);
  });

  it('revogada, kick e aviso não estão ativos', () => {
    expect(isActiveAt(sanction({ revokedAt: ago(0.1) }), now)).toBe(false);
    expect(isActiveAt(sanction({ type: 'kick', endsAt: null }), now)).toBe(false);
    expect(isActiveAt(sanction({ type: 'warning', endsAt: null }), now)).toBe(false);
  });

  it('expira exatamente no horário', () => {
    expect(isActiveAt(sanction({ endsAt: now }), now)).toBe(false);
  });
});

describe('previousOffensesAt (reincidência em 30 dias)', () => {
  it('conta ocorrências da Categoria na janela, não medidas', () => {
    const incident = 'aaaaaaaa-0000-4000-8000-000000000001';
    const records = [
      sanction({ category: 'discrimination', incidentId: incident, type: 'gag' }),
      sanction({ category: 'discrimination', incidentId: incident, type: 'ban' }),
      sanction({ category: 'griefing', type: 'kick', endsAt: null, startsAt: ago(3) }),
      sanction({ category: 'griefing', startsAt: ago(29) }),
    ];

    const counts = previousOffensesAt(records, now);

    expect(counts.discrimination).toBe(1);
    expect(counts.griefing).toBe(2);
    expect(counts.cheat).toBe(0);
  });

  it('fora da janela de 30 dias e recurso aceito não contam; revogada sem recurso conta', () => {
    const records = [
      sanction({ category: 'exploit', startsAt: ago(31) }),
      sanction({ category: 'exploit', revokedAt: ago(0.5), appealAccepted: true }),
      sanction({ category: 'exploit', revokedAt: ago(0.5) }),
    ];

    expect(previousOffensesAt(records, now).exploit).toBe(1);
  });
});

describe('toProfileSanctions (Perfil público)', () => {
  it('mostra as ativas e o histórico de 12 meses sem avisos, do mais recente ao mais antigo', () => {
    const active = sanction({ type: 'gag', category: 'offensive_chat', startsAt: ago(0.1) });
    const old = sanction({ startsAt: ago(200), endsAt: ago(199) });
    const kick = sanction({ type: 'kick', endsAt: null, startsAt: ago(10) });
    const warning = sanction({ type: 'warning', endsAt: null, startsAt: ago(5) });
    const tooOld = sanction({ startsAt: ago(400), endsAt: ago(399) });

    const view = toProfileSanctions([old, warning, tooOld, active, kick], now);

    expect(view.active.map((s) => s.id)).toEqual([active.id]);
    expect(view.history.map((s) => s.id)).toEqual([active.id, kick.id, old.id]);
    expect(view.history[0]).toEqual({
      id: active.id,
      type: 'gag',
      category: 'offensive_chat',
      startsAt: active.startsAt.toISOString(),
      endsAt: active.endsAt?.toISOString(),
      revoked: false,
    });
  });

  it('o ban permanente por cheat fica sempre visível, mesmo com mais de 12 meses', () => {
    const cheat = sanction({ category: 'cheat', endsAt: null, startsAt: ago(800) });

    const view = toProfileSanctions([cheat], now);

    expect(view.active.map((s) => s.id)).toEqual([cheat.id]);
    expect(view.history.map((s) => s.id)).toEqual([cheat.id]);
  });

  it('recurso aceito some; revogada sem recurso fica com o fim antecipado', () => {
    const appealed = sanction({ revokedAt: ago(0.5), appealAccepted: true });
    const revoked = sanction({ startsAt: ago(2), endsAt: ahead(5), revokedAt: ago(1) });

    const view = toProfileSanctions([appealed, revoked], now);

    expect(view.active).toEqual([]);
    expect(view.history).toEqual([
      expect.objectContaining({ id: revoked.id, endsAt: ago(1).toISOString(), revoked: true }),
    ]);
  });
});

describe('gameSanctionMessage', () => {
  const appeal = 'stcarmine.com/regras#recurso';

  it('ban temporário: Categoria, até quando (Brasília) e como recorrer', () => {
    const message = gameSanctionMessage(
      { type: 'ban', category: 'griefing', endsAt: new Date('2026-10-20T17:00:00Z') },
      appeal,
    );

    expect(message).toBe(
      'Você está banido dos Servidores Carmine até 20/10 às 14:00 (Brasília). Motivo: Griefing. Para recorrer: stcarmine.com/regras#recurso',
    );
  });

  it('ban permanente, mute, gag, kick e aviso', () => {
    expect(gameSanctionMessage({ type: 'ban', category: 'cheat', endsAt: null }, appeal)).toBe(
      'Você está banido permanentemente dos Servidores Carmine. Motivo: Cheat. Para recorrer: stcarmine.com/regras#recurso',
    );
    expect(
      gameSanctionMessage(
        { type: 'mute', category: 'offensive_voice', endsAt: new Date('2026-10-12T16:30:00Z') },
        appeal,
      ),
    ).toBe(
      'Você está sem voz até 12/10 às 13:30 (Brasília). Motivo: Conduta na voz. Para recorrer: stcarmine.com/regras#recurso',
    );
    expect(
      gameSanctionMessage({ type: 'gag', category: 'offensive_chat', endsAt: null }, appeal),
    ).toBe(
      'Você está sem chat permanentemente. Motivo: Conduta no chat. Para recorrer: stcarmine.com/regras#recurso',
    );
    expect(gameSanctionMessage({ type: 'kick', category: 'griefing', endsAt: null }, appeal)).toBe(
      'Você foi expulso do servidor pela Staff. Motivo: Griefing. Regras: stcarmine.com/regras#recurso',
    );
    expect(
      gameSanctionMessage({ type: 'warning', category: 'offensive_chat', endsAt: null }, appeal),
    ).toBe(
      'Aviso da Staff: Conduta no chat. Reincidir leva a punições maiores. Regras: stcarmine.com/regras#recurso',
    );
  });
});
