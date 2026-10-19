import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { DataRetention } from './data-retention.js';

/** Roda a {@link DataRetention} ao subir e depois no intervalo; `intervalMs` 0 desliga. */
export class RetentionJob implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionJob.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly retention: Pick<DataRetention, 'sweep'>,
    private readonly intervalMs: number,
  ) {}

  onModuleInit(): void {
    if (this.intervalMs <= 0) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Nunca rejeita: um Postgres fora só adia a limpeza para a próxima rodada. */
  async run(): Promise<void> {
    try {
      await this.retention.sweep();
    } catch (error) {
      this.logger.warn(`Limpeza de retenção falhou: ${(error as Error).message}`);
    }
  }
}
