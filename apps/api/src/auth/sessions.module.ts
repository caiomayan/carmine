import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { SessionStore } from './sessions.js';

/** As sessões do site no Valkey: o login abre, o guard lê e o painel da Staff derruba (ban). */
@Module({
  providers: [
    {
      provide: SessionStore,
      inject: [VALKEY, APP_CONFIG],
      useFactory: (valkey: Redis, config: AppConfig) => new SessionStore(valkey, config.session),
    },
  ],
  exports: [SessionStore],
})
export class SessionsModule {}
