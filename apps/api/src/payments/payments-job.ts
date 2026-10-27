import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Payments } from './payments.js';

/** A conciliação lenta olha os pagamentos dos últimos dias (cobre a janela de 7 dias de reembolso). */
const RECONCILE_DAYS = 8;
/** A cada tantas varreduras (com 60 s, ~30 min). */
const RECONCILE_EVERY = 30;

/**
 * A varredura de pagamentos (S14): a cada `intervalMs`, confere os pendentes com o provedor e vence os
 * QR expirados; de vez em quando, reconcilia os aprovados recentes (pega estorno e contestação cujo
 * webhook se perdeu). Nunca lança: o provedor fora do ar só adia para a próxima. Intervalo 0 ou
 * cobrança indisponível: desligada.
 */
export class PaymentsJob implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentsJob.name);
  private timer: NodeJS.Timeout | undefined;
  private runs = 0;

  constructor(
    private readonly payments: Pick<Payments, 'available' | 'sweep' | 'reconcile'>,
    private readonly intervalMs: number,
  ) {}

  onModuleInit(): void {
    if (this.intervalMs <= 0 || !this.payments.available) return;
    this.timer = setInterval(() => void this.run(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<void> {
    try {
      const { expired } = await this.payments.sweep(now);
      if (expired > 0) this.logger.log(`${expired} pagamento(s) com QR vencido`);
      this.runs += 1;
      if (this.runs % RECONCILE_EVERY === 0) {
        const since = new Date(now.getTime() - RECONCILE_DAYS * 24 * 60 * 60 * 1000);
        const { changed } = await this.payments.reconcile({ since }, now);
        if (changed > 0)
          this.logger.warn(`Conciliação: ${changed} pagamento(s) mudaram sem webhook`);
      }
    } catch (error) {
      this.logger.warn(`Varredura de pagamentos falhou: ${(error as Error).message}`);
    }
  }
}
