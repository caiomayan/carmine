import { type DynamicModule, Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AccountsModule } from '../accounts/accounts.module.js';
import { DiscordWebhook } from '../alerts/discord-webhook.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { StaffGuard } from '../staff/staff.guard.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { VipModule } from '../vip/vip.module.js';
import { VipCompensation } from '../vip/vip-compensation.js';
import { VipHold } from '../vip/vip-hold.js';
import { VipHoldModule } from '../vip/vip-hold.module.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { FakePaymentsGateway } from './fake-gateway.js';
import type { PaymentsGateway } from './gateway.js';
import { MercadoPagoClient } from './mercadopago/mercadopago-client.js';
import { MercadoPagoGateway } from './mercadopago/mercadopago-gateway.js';
import {
  DevPaymentsController,
  PurchasesController,
  VipCatalogController,
  WebhooksController,
} from './payments.controller.js';
import { Payments } from './payments.js';
import { PaymentsJob } from './payments-job.js';
import { StaffPaymentsController } from './staff-payments.controller.js';
import { StaffPayments } from './staff-payments.js';

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
      imports: [VipModule, VipHoldModule, AccountsModule, ModerationModule],
      controllers: [
        VipCatalogController,
        PurchasesController,
        WebhooksController,
        StaffPaymentsController,
        ...(fake ? [DevPaymentsController] : []),
      ],
      providers: [
        StaffGuard,
        {
          provide: PAYMENTS_GATEWAY,
          inject: [VALKEY, APP_CONFIG],
          useFactory: (valkey: Redis, appConfig: AppConfig): PaymentsGateway | null => {
            if (appConfig.payments.provider === 'fake') {
              return new FakePaymentsGateway(valkey, { publicWebUrl: appConfig.publicWebUrl });
            }
            if (appConfig.payments.provider === 'mercadopago') {
              const credentials = appConfig.payments.mercadopago;
              if (credentials === null) {
                // Sem o token e o segredo do webhook a compra fica indisponível (a configuração já recusa ligar assim).
                new Logger('Payments').warn(
                  'Mercado Pago sem MERCADOPAGO_ACCESS_TOKEN e MERCADOPAGO_WEBHOOK_SECRET: a compra fica indisponível',
                );
                return null;
              }
              return new MercadoPagoGateway({
                client: new MercadoPagoClient({ accessToken: credentials.accessToken }),
                webhookSecret: credentials.webhookSecret,
                // O e-mail do pagador (que o Pix exige) usa o domínio do próprio site.
                payerEmailDomain: new URL(appConfig.publicWebUrl).hostname,
              });
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
          // O painel da Staff nos pagamentos (S14): faz o que o CLI `payments ...` faz.
          provide: StaffPayments,
          inject: [DATABASE, Payments, VipCompensation],
          useFactory: (db: Database, payments: Payments, compensation: VipCompensation) =>
            new StaffPayments(db, payments, compensation),
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
