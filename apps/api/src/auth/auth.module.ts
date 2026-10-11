import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { AccountsModule } from '../accounts/accounts.module.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { LoadoutModule } from '../loadout/loadout.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { VipModule } from '../vip/vip.module.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './session.guard.js';
import { SessionStore } from './sessions.js';
import { SteamLogin, ValkeyNonceRegistry } from './steam-login.js';
import { SteamOpenId } from './steam-openid.js';

/** A Steam leva alguns segundos; mais que isso e o login falha como indisponível. */
const STEAM_OPENID_TIMEOUT_MS = 5000;
/** Uma asserção mais velha que isso não é aceita (e o nonce dela fica guardado esse tempo). */
const MAX_ASSERTION_AGE_MS = 5 * 60 * 1000;

const DEFAULT_STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';

/** Login Steam, sessões do site e proteção CSRF (S03). */
@Module({
  imports: [AccountsModule, VipModule, LoadoutModule],
  controllers: [AuthController],
  providers: [
    {
      provide: SessionStore,
      inject: [VALKEY, APP_CONFIG],
      useFactory: (valkey: Redis, config: AppConfig) => new SessionStore(valkey, config.session),
    },
    {
      provide: SteamLogin,
      inject: [VALKEY, APP_CONFIG],
      useFactory: (valkey: Redis, config: AppConfig) => {
        if (config.steamOpenIdUrl !== DEFAULT_STEAM_OPENID_URL) {
          new Logger(SteamLogin.name).warn(
            `Login Steam apontando para ${config.steamOpenIdUrl}, não para a Steam real`,
          );
        }
        const openId = new SteamOpenId(
          {
            endpoint: config.steamOpenIdUrl,
            realm: config.publicWebUrl,
            callbackUrl: `${config.publicWebUrl}/api/auth/steam/callback`,
            timeoutMs: STEAM_OPENID_TIMEOUT_MS,
            maxAssertionAgeMs: MAX_ASSERTION_AGE_MS,
          },
          new ValkeyNonceRegistry(valkey),
        );
        return new SteamLogin(valkey, openId);
      },
    },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AuthModule {}
