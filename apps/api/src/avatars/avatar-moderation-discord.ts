import { AVATAR_REASON_LABELS, type AvatarReason } from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import type { DiscordWebhook } from '../alerts/discord-webhook.js';

/** O que o aviso de uma denúncia de foto diz. Nada de quem denunciou nem da imagem: isso fica no painel. */
export interface AvatarReportNotice {
  reason: AvatarReason;
  targetName: string;
  targetPublicId: number;
  /** Contas diferentes que denunciaram esta foto (sem arquivadas). */
  reporters: number;
  /** A foto saiu do ar com esta denúncia (chegou ao limite). */
  suspended: boolean;
}

/** Nome de jogador num aviso: uma linha só e sem Markdown que bagunce a mensagem. */
function plain(name: string): string {
  return name
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\*_`~|>]/g, '\\$&')
    .slice(0, 64);
}

/** A mensagem do canal da Staff: motivo, Perfil, quantas Contas denunciaram e o link da fila. */
export function avatarReportDiscordMessage(notice: AvatarReportNotice, panelUrl: string): string {
  return [
    `🖼️ **Denúncia de foto de perfil: ${AVATAR_REASON_LABELS[notice.reason]}**`,
    `Perfil: ${plain(notice.targetName)} (#${notice.targetPublicId})`,
    notice.suspended
      ? `Saiu do ar com ${notice.reporters} denúncias; a Staff decide em até 24 h`
      : `${notice.reporters} ${notice.reporters === 1 ? 'denúncia' : 'denúncias'}`,
    `Fila: ${panelUrl}`,
  ].join('\n');
}

/**
 * Avisa a Staff no Discord (o mesmo webhook das Denúncias do jogo). Sem webhook configurado não faz
 * nada; uma falha nunca atrapalha a denúncia (ela já está na fila do painel).
 */
export class AvatarReportNotifier {
  private readonly logger = new Logger(AvatarReportNotifier.name);

  constructor(
    private readonly webhook: DiscordWebhook,
    private readonly panelUrl: string,
  ) {}

  notify(notice: AvatarReportNotice): void {
    if (!this.webhook.enabled) return;
    this.webhook.send(avatarReportDiscordMessage(notice, this.panelUrl)).catch((error: unknown) => {
      this.logger.warn(
        `Aviso da denúncia de foto de #${notice.targetPublicId} falhou: ${(error as Error).message}`,
      );
    });
  }
}
