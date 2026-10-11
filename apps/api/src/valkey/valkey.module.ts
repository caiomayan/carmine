import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

/** Tempo máximo de um comando ao Valkey. */
export const VALKEY_COMMAND_TIMEOUT_MS = 2000;

/** Cliente do Valkey (compatível com o protocolo Redis). */
export const VALKEY = Symbol('VALKEY');

@Global()
@Module({
  providers: [
    {
      provide: VALKEY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const logger = new Logger('Valkey');
        // Com o Valkey fora, um comando falha em até 2 s (as sessões respondem 503) em vez de
        // esperar na fila de reconexão e travar a requisição.
        const client = new Redis(config.valkeyUrl, {
          maxRetriesPerRequest: 1,
          commandTimeout: VALKEY_COMMAND_TIMEOUT_MS,
        });
        // O ioredis reconecta sozinho; o listener evita o "Unhandled error event".
        client.on('error', (error) => logger.warn(`Conexão com o Valkey falhou: ${error.message}`));
        return client;
      },
    },
  ],
  exports: [VALKEY],
})
export class ValkeyModule implements OnApplicationShutdown {
  constructor(@Inject(VALKEY) private readonly client: Redis) {}

  onApplicationShutdown(): void {
    this.client.disconnect();
  }
}
