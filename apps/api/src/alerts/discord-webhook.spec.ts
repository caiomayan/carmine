import { describe, expect, it, vi } from 'vitest';
import { DiscordWebhook } from './discord-webhook.js';

const URL_OK = 'https://discord.example/api/webhooks/1/x';

describe('DiscordWebhook', () => {
  it('sem URL fica desligado e não chama a rede', async () => {
    const fetchImpl = vi.fn();
    const webhook = new DiscordWebhook(null, 1000, fetchImpl);

    expect(webhook.enabled).toBe(false);
    expect(await webhook.send('oi')).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posta o texto sem permitir menções', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const webhook = new DiscordWebhook(URL_OK, 1000, fetchImpl);

    expect(await webhook.send('🔴 caiu')).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_OK);
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'Carmine',
      content: '🔴 caiu',
      allowed_mentions: { parse: [] },
    });
  });

  it('resposta de erro ou rede fora: devolve false e não lança', async () => {
    const recusa = new DiscordWebhook(
      URL_OK,
      1000,
      async () => new Response(null, { status: 429 }),
    );
    const fora = new DiscordWebhook(URL_OK, 1000, async () => {
      throw new Error('ECONNREFUSED');
    });

    expect(await recusa.send('x')).toBe(false);
    expect(await fora.send('x')).toBe(false);
  });
});
