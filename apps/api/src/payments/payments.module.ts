import { type DynamicModule, Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AccountsModule } from '../accounts/accounts.module.js';
import { DiscordWebhook } from '../alerts/discord-webhook.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { VipModule } from '../vip/vip.module.js';
import { VipCompensation } from '../vip/vip-compensation.js';
import { VipHold } from '../vip/vip-hold.js';
import { VipHoldModule } from '../vip/vip-hold.module.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { FakePaymentsGateway } from './fake-gateway.js';
import type { PaymentsGateway } from './gateway.js';
import {
  DevPaymentsController,
  PurchasesController,
  VipCatalogController,
  WebhooksController,
} from './payments.controller.js';
import { Payments } from './payments.js';
import { PaymentsJob } from './payments-job.js';

export const PAYMENTS_GATEWAY = Symbol('PAYMENTS_GATEWAY');

/**
 * Pacotes VIP e pagamentos (S14). A cobrança nasce desligada (`PAYMENTS_ENABLED`); o provedor é o
 * Mercado Pago ou o falso (só em host de homologação, que a configuração garante). O controller de
 * simulação só existe com o falso.
 */
@Module({})
export class PaymentsModule {
  static forRoot(config: AppConfig): DynamicModule {
    const fake = config.payments.provider === 'fake';
    return {
      module: PaymentsModule,
      imports: [VipModule, VipHoldModule, AccountsModule],
      controllers: [
        VipCatalogController,
        PurchasesController,
        WebhooksController,
        ...(fake ? [DevPaymentsController] : []),
      ],
      providers: [
        {
          provide: PAYMENTS_GATEWAY,
          inject: [VALKEY, APP_CONFIG],
          useFactory: (valkey: Redis, appConfig: AppConfig): PaymentsGateway | null => {
            if (appConfig.payments.provider === 'fake') {
              return new FakePaymentsGateway(valkey, { publicWebUrl: appConfig.publicWebUrl });
            }
            if (appConfig.payments.provider === 'mercadopago') {
              // O adaptador do Mercado Pago entra na S14c; até lá a compra fica indisponível.
              new Logger('Payments').warn(
                'Adaptador do Mercado Pago ainda não existe: a compra fica indisponível',
              );
            }
            return null;
          },
        },
        {
          provide: 'FAKE_PAYMENTS_GATEWAY',
          inject: [PAYMENTS_GATEWAY],
          useFactory: (gateway: PaymentsGateway | null) => gateway,
        },
        {
          provide: Payments,
          inject: [DATABASE, PAYMENTS_GATEWAY, VipPeriods, VipHold, APP_CONFIG],
          useFactory: (
            db: Database,
            gateway: PaymentsGateway | null,
            vip: VipPeriods,
            hold: VipHold,
            appConfig: AppConfig,
          ) => {
            const alerts = new DiscordWebhook(appConfig.alerts.discordWebhookUrl);
            const payments = new Payments({
              db,
              gateway,
              vip,
              enabled: appConfig.payments.enabled,
              dataKey: appConfig.payments.dataKey,
              publicWebUrl: appConfig.publicWebUrl,
              alert: (message) => alerts.send(`💳 ${message}`),
              // O VIP mudou: guarda ou devolve os Itens VIP na hora (a varredura é a rede de segurança).
              onVipChanged: (accountId) => hold.syncAccount(accountId),
            });
            // O falso entrega o webhook assinado direto no tratador de verdade.
            if (gateway instanceof FakePaymentsGateway) {
              gateway.attach(async (request) => {
                await payments.handleWebhook(request);
              });
            }
            return payments;
          },
        },
        {
          provide: VipCompensation,
          inject: [DATABASE, VipPeriods, APP_CONFIG],
          useFactory: (db: Database, vip: VipPeriods, appConfig: AppConfig) => {
            const alerts = new DiscordWebhook(appConfig.alerts.discordWebhookUrl);
            return new VipCompensation(db, vip, (message) => alerts.send(`🕒 ${message}`));
          },
        },
        {
          provide: PaymentsJob,
          inject: [Payments, APP_CONFIG],
          useFactory: (payments: Payments, appConfig: AppConfig) =>
            new PaymentsJob(payments, appConfig.payments.sweepMs),
        },
      ],
      exports: [Payments, VipCompensation],
    };
  }
}
