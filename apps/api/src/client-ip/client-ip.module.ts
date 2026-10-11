import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { ClientIpResolver } from './client-ip.js';

/** O IP real das requisições (`ClientIpResolver`), configurado por `TRUSTED_PROXIES`. */
@Global()
@Module({
  providers: [
    {
      provide: ClientIpResolver,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new ClientIpResolver(config.trustedProxies),
    },
  ],
  exports: [ClientIpResolver],
})
export class ClientIpModule {}
