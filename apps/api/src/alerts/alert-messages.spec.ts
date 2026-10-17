import { describe, expect, it } from 'vitest';
import { formatAlert } from './alert-messages.js';

const now = new Date('2026-10-17T12:10:00Z');

describe('formatAlert', () => {
  it('servidor offline: nome e há quanto tempo', () => {
    expect(
      formatAlert(
        {
          kind: 'offline',
          serverId: 's',
          name: 'Retake SP',
          offlineSince: new Date('2026-10-17T12:07:00Z'),
        },
        now,
      ),
    ).toBe('🔴 **Retake SP** está offline há 3 min (sem batimento do Carmine.Core).');
  });

  it('servidor de volta: quanto tempo ficou fora, em minutos ou horas', () => {
    const recovered = (downForMs: number) =>
      formatAlert({ kind: 'recovered', serverId: 's', name: 'DM SP', downForMs }, now);

    expect(recovered(90_000)).toBe('🟢 **DM SP** voltou depois de 2 min.');
    expect(recovered(5_400_000)).toBe('🟢 **DM SP** voltou depois de 1 h 30 min.');
  });
});
