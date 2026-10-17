import type { LiveServerList } from '@carmine/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { DiscordWebhook } from './discord-webhook.js';
import { ServerAlerts } from './server-alerts.js';
import { ServerOfflineTracker } from './server-offline-tracker.js';

const list = (state: 'online' | 'offline'): LiveServerList =>
  ({ servers: [{ id: 's1', name: 'Retake SP', state }] }) as unknown as LiveServerList;

describe('ServerAlerts', () => {
  function setup() {
    const clock = { now: new Date('2026-10-17T12:00:00Z') };
    const state = { current: list('online') };
    const send = vi.fn().mockResolvedValue(true);
    const alerts = new ServerAlerts(
      { current: async () => state.current },
      new ServerOfflineTracker({ confirmAfterMs: 60_000 }),
      { enabled: true, send } as unknown as DiscordWebhook,
      { sweepMs: 1000 },
      () => clock.now,
    );
    const advance = (seconds: number) => {
      clock.now = new Date(clock.now.getTime() + seconds * 1000);
    };
    return { alerts, state, send, advance };
  }

  it('manda ao Discord o aviso de queda e o de volta', async () => {
    const { alerts, state, send, advance } = setup();
    await alerts.check();

    state.current = list('offline');
    await alerts.check();
    advance(61);
    await alerts.check();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toContain('🔴 **Retake SP** está offline há 1 min');

    state.current = list('online');
    advance(30);
    await alerts.check();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toContain('🟢 **Retake SP** voltou');
  });

  it('com a lista indisponível (Valkey fora) não lança nem avisa', async () => {
    const send = vi.fn();
    const alerts = new ServerAlerts(
      { current: async () => Promise.reject(new Error('Connection is closed.')) },
      new ServerOfflineTracker({ confirmAfterMs: 1000 }),
      { enabled: true, send } as unknown as DiscordWebhook,
      { sweepMs: 1000 },
    );

    await expect(alerts.check()).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
