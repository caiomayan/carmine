import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { VALKEY } from '../valkey/valkey.module.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimiter } from './rate-limiter.js';

/**
 * Rate limit da API sobre o Valkey. As rotas declaram a política com `@RateLimit('<nome>')`
 * (políticas em `policies.ts`); o resto (contagem, IP real, cabeçalhos, 429) fica aqui dentro.
 */
@Global()
@Module({
  providers: [
    {
      provide: RateLimiter,
      inject: [VALKEY],
      useFactory: (valkey: Redis) => new RateLimiter(valkey),
    },
    RateLimitGuard,
  ],
  exports: [RateLimiter, RateLimitGuard],
})
export class RateLimitModule {}
