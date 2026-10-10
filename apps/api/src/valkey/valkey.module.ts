import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

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
        const client = new Redis(config.valkeyUrl, { maxRetriesPerRequest: 1 });
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
