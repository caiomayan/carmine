import { timingSafeEqual } from 'node:crypto';
import { safeReturnPath } from '@carmine/contracts';
import type { Redis } from 'ioredis';
import { randomToken } from './sessions.js';
import type { NonceRegistry, OpenIdFailure, SteamOpenId } from './steam-openid.js';

/** Quanto tempo a pessoa tem para entrar na Steam e voltar. */
export const LOGIN_FLOW_TTL_SECONDS = 10 * 60;

const STATE_PREFIX = 'carmine:login-state:';
const NONCE_PREFIX = 'carmine:openid-nonce:';

export type LoginCompletion =
  | { ok: true; steamId: string; returnTo: string }
  | ({ ok: false; returnTo: string } & OpenIdFailure);

/**
 * O fluxo de login Steam de ponta a ponta. Cada início gera um `state` aleatório que vai no
 * `return_to` (assinado pela Steam) e num cookie do navegador; a volta só vale se os dois
 * baterem e o `state` ainda não foi usado. Isso amarra a asserção ao navegador que começou o
 * login (sem login CSRF: ninguém loga a vítima na conta de outro) e guarda a página de origem
 * no servidor, fora do alcance de quem monta a URL.
 */
export class SteamLogin {
  constructor(
    private readonly valkey: Redis,
    private readonly openId: SteamOpenId,
  ) {}

  /** Começa o login: o `state` vai no cookie e o navegador vai para `redirectUrl`. */
  async start(returnTo: string | undefined): Promise<{ state: string; redirectUrl: string }> {
    const state = randomToken();
    await this.valkey.set(
      `${STATE_PREFIX}${state}`,
      safeReturnPath(returnTo),
      'EX',
      LOGIN_FLOW_TTL_SECONDS,
    );
    return { state, redirectUrl: this.openId.loginUrl({ state }) };
  }

  /**
   * Termina o login com a volta da Steam (`callbackUrl`, a URL pública completa) e o `state`
   * do cookie. O `state` é gasto mesmo se a verificação falhar.
   */
  async complete(stateCookie: string | undefined, callbackUrl: URL): Promise<LoginCompletion> {
    const state = callbackUrl.searchParams.get('state') ?? '';
    if (!stateCookie || !sameToken(stateCookie, state)) {
      return {
        ok: false,
        reason: 'invalid',
        detail: 'state ausente ou diferente do cookie',
        returnTo: '/',
      };
    }
    const stored = await this.valkey.getdel(`${STATE_PREFIX}${state}`);
    if (stored === null) {
      return { ok: false, reason: 'invalid', detail: 'login expirado ou já usado', returnTo: '/' };
    }
    const returnTo = safeReturnPath(stored);
    const result = await this.openId.verify(callbackUrl);
    return { ...result, returnTo };
  }
}

/** Nonces das asserções no Valkey (`SET NX`): o primeiro login com a asserção ganha. */
export class ValkeyNonceRegistry implements NonceRegistry {
  constructor(private readonly valkey: Redis) {}

  async claim(nonce: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.valkey.set(`${NONCE_PREFIX}${nonce}`, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
}

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
