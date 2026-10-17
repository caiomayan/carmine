import { Logger } from '@nestjs/common';

/**
 * Posta mensagens num webhook do Discord. Sem URL (variável vazia) fica desligado; uma falha
 * nunca derruba quem avisa: vai para o log e a mensagem é perdida.
 */
export class DiscordWebhook {
  private readonly logger = new Logger(DiscordWebhook.name);

  constructor(
    private readonly url: string | null,
    private readonly timeoutMs = 5000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return this.url !== null;
  }

  async send(content: string): Promise<boolean> {
    if (this.url === null) return false;
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // allowed_mentions vazio: nome de servidor nunca marca ninguém.
        body: JSON.stringify({ username: 'Carmine', content, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`Discord recusou o aviso: HTTP ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`Discord indisponível: ${(error as Error).message}`);
      return false;
    }
  }
}
