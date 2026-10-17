import { describe, expect, it } from 'vitest';
import { ServerOfflineTracker } from './server-offline-tracker.js';

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 17, 12, 0, seconds));
const server = (state: 'online' | 'full' | 'offline', id = 's1') => ({
  id,
  name: `Servidor ${id}`,
  state,
});

describe('ServerOfflineTracker', () => {
  const tracker = () => new ServerOfflineTracker({ confirmAfterMs: 60_000 });

  it('servidor no ar não gera nada', () => {
    const t = tracker();

    expect(t.observe([server('online')], at(0))).toEqual([]);
    expect(t.observe([server('full')], at(30))).toEqual([]);
  });

  it('só avisa depois de ficar offline pelo tempo de confirmação, e uma vez só', () => {
    const t = tracker();
    t.observe([server('online')], at(0));

    expect(t.observe([server('offline')], at(10))).toEqual([]);
    expect(t.observe([server('offline')], at(69))).toEqual([]);
    expect(t.observe([server('offline')], at(70))).toEqual([
      { kind: 'offline', serverId: 's1', name: 'Servidor s1', offlineSince: at(10) },
    ]);
    expect(t.observe([server('offline')], at(300))).toEqual([]);
  });

  it('uma queda curta (troca de mapa, reinício rápido) não vira alerta nem aviso de volta', () => {
    const t = tracker();
    t.observe([server('offline')], at(0));
    t.observe([server('offline')], at(30));

    expect(t.observe([server('online')], at(40))).toEqual([]);
    expect(t.observe([server('offline')], at(50))).toEqual([]);
    // A contagem recomeça na nova queda.
    expect(t.observe([server('offline')], at(100))).toEqual([]);
  });

  it('avisa quando o servidor volta depois de um alerta, com o tempo fora', () => {
    const t = tracker();
    t.observe([server('offline')], at(0));
    t.observe([server('offline')], at(60));

    expect(t.observe([server('online')], at(180))).toEqual([
      { kind: 'recovered', serverId: 's1', name: 'Servidor s1', downForMs: 180_000 },
    ]);
    expect(t.observe([server('online')], at(190))).toEqual([]);
  });

  it('depois de voltar, uma nova queda alerta de novo', () => {
    const t = tracker();
    t.observe([server('offline')], at(0));
    t.observe([server('offline')], at(60));
    t.observe([server('online')], at(100));
    t.observe([server('offline')], at(200));

    expect(t.observe([server('offline')], at(260))).toEqual([
      { kind: 'offline', serverId: 's1', name: 'Servidor s1', offlineSince: at(200) },
    ]);
  });

  it('acompanha cada servidor separadamente e esquece os que saíram da lista', () => {
    const t = tracker();
    t.observe([server('offline', 'a'), server('online', 'b')], at(0));

    expect(t.observe([server('offline', 'a'), server('offline', 'b')], at(60))).toEqual([
      { kind: 'offline', serverId: 'a', name: 'Servidor a', offlineSince: at(0) },
    ]);
    t.observe([server('online', 'b')], at(70));
    // 'a' foi removido e voltou: conta como novo, sem "voltou" fantasma.
    expect(t.observe([server('online', 'a'), server('online', 'b')], at(80))).toEqual([]);
  });
});
