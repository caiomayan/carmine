import { Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { Catalog } from '../catalog/catalog.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { EquippedModule } from '../equipped/equipped.module.js';
import { EquippedCache } from '../equipped/equipped-cache.js';
import { VipModule } from './vip.module.js';
import { VipHold } from './vip-hold.js';
import { VipPeriods } from './vip-periods.js';

/** A varredura da guarda de Itens VIP (S14, D3): guarda, devolve e apaga, de tantos em tantos segundos (0 desliga). */
export class VipHoldJob implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(VipHoldJob.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly hold: Pick<VipHold, 'sweep'>,
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

  /** Nunca rejeita: o Postgres fora só adia para a próxima rodada. */
  async run(): Promise<void> {
    try {
      const { held, restored, purged } = await this.hold.sweep();
      if (held + restored + purged > 0) {
        this.logger.log(
          `Itens VIP: ${held} Conta(s) com itens guardados, ${restored} com itens devolvidos, ${purged} registro(s) apagado(s)`,
        );
      }
    } catch (error) {
      this.logger.warn(`Varredura dos Itens VIP falhou: ${(error as Error).message}`);
    }
  }
}

/** A guarda dos Itens VIP por 30 dias depois que o VIP acaba (S14, D3). */
@Module({
  imports: [VipModule, EquippedModule],
  providers: [
    {
      provide: VipHold,
      inject: [DATABASE, Catalog, VipPeriods, EquippedCache, APP_CONFIG],
      useFactory: (
        db: Database,
        catalog: Catalog,
        vip: VipPeriods,
        equipped: EquippedCache,
        config: AppConfig,
      ) =>
        new VipHold({
          db,
          catalog,
          vip,
          enabled: config.vipHold.enabled,
          onChanged: (accountId) => equipped.loadoutChanged(accountId),
        }),
    },
    {
      provide: VipHoldJob,
      inject: [VipHold, APP_CONFIG],
      useFactory: (hold: VipHold, config: AppConfig) =>
        new VipHoldJob(hold, config.vipHold.enabled ? config.vipHold.sweepMs : 0),
    },
  ],
  exports: [VipHold],
})
export class VipHoldModule {}
