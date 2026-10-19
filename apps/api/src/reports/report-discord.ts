import { REPORT_REASON_LABELS } from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import type { DiscordWebhook } from '../alerts/discord-webhook.js';
import type { CreatedReport } from './reports.js';

/** Nome de jogador num aviso: uma linha só e sem Markdown que bagunce a mensagem. */
function plain(name: string): string {
  return name
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\*_`~|>]/g, '\\$&')
    .slice(0, 64);
}

/**
 * O aviso da Denúncia nova no canal da Staff: motivo, alvo (nome e ID público), servidor e o link
 * para a fila. Nada de denunciante, SteamID64 nem texto do chat: isso fica no painel.
 */
export function reportDiscordMessage(report: CreatedReport, panelUrl: string): string {
  const server = report.server.code
    ? `${report.server.code} (${report.server.name})`
    : report.server.name;
  return [
    `🚩 **Nova Denúncia: ${REPORT_REASON_LABELS[report.reason]}**`,
    `Alvo: ${plain(report.target.displayName)} (#${report.target.publicId})`,
    `Servidor: ${plain(server)}`,
    `Fila: ${panelUrl}`,
  ].join('\n');
}

/**
 * Avisa a Staff no Discord. Sem webhook configurado não faz nada; uma falha nunca atrapalha a
 * Denúncia (a Denúncia já está na fila do painel).
 */
export class ReportNotifier {
  private readonly logger = new Logger(ReportNotifier.name);

  constructor(
    private readonly webhook: DiscordWebhook,
    private readonly panelUrl: string,
  ) {}

  notify(report: CreatedReport): void {
    if (!this.webhook.enabled) return;
    this.webhook.send(reportDiscordMessage(report, this.panelUrl)).catch((error: unknown) => {
      this.logger.warn(`Aviso da Denúncia ${report.id} falhou: ${(error as Error).message}`);
    });
  }
}
