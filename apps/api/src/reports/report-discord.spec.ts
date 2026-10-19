import { describe, expect, it, vi } from 'vitest';
import { DiscordWebhook } from '../alerts/discord-webhook.js';
import { ReportNotifier, reportDiscordMessage } from './report-discord.js';
import type { CreatedReport } from './reports.js';

const report: CreatedReport = {
  id: '0199f2a0-7b1c-7000-8000-000000000001',
  reason: 'voice',
  target: { publicId: 10_016, displayName: 'Alvo *negrito*\n@everyone' },
  server: { id: 'x', name: 'retake-1', code: 'SP·1', mode: 'retake' },
};

describe('reportDiscordMessage', () => {
  it('leva motivo, alvo (nome e ID público), servidor e o link da fila, e nada mais', () => {
    expect(reportDiscordMessage(report, 'https://stcarmine.com/staff/denuncias')).toBe(
      [
        '🚩 **Nova Denúncia: Voz ofensiva**',
        'Alvo: Alvo \\*negrito\\* @everyone (#10016)',
        'Servidor: SP·1 (retake-1)',
        'Fila: https://stcarmine.com/staff/denuncias',
      ].join('\n'),
    );
  });
});

describe('ReportNotifier', () => {
  it('sem webhook configurado não envia nada e não dá erro', () => {
    const fetchImpl = vi.fn();
    const notifier = new ReportNotifier(new DiscordWebhook(null, 1000, fetchImpl), 'https://x');
    expect(() => notifier.notify(report)).not.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('com webhook, posta a mensagem; Discord fora do ar não propaga erro', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('rede caiu'));
    const notifier = new ReportNotifier(
      new DiscordWebhook('https://discord.test/hook', 1000, fetchImpl),
      'https://x',
    );
    expect(() => notifier.notify(report)).not.toThrow();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
  });
});
