import { timingSafeEqual } from 'node:crypto';
import { type DiscordLinkResult, safeReturnPath } from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { randomToken } from '../auth/sessions.js';
import type { DiscordClient } from './discord-client.js';
import { AccountAlreadyLinked, DiscordAlreadyLinked, type DiscordLinks } from './discord-links.js';
import type { DiscordRoleSync } from './discord-role-sync.js';

/** Quanto tempo a pessoa tem para autorizar no Discord e voltar. */
export const DISCORD_FLOW_TTL_SECONDS = 10 * 60;

const STATE_PREFIX = 'carmine:discord-state:';

export interface DiscordLinkOutcome {
  result: DiscordLinkResult;
  returnTo: string;
}

/**
 * O vínculo do Discord pelo OAuth2 (S15). Não é login: exige a sessão Steam e só liga um Discord à
 * Conta dela. O `state` aleatório fica no Valkey (preso à Conta que começou) e num cookie do
 * navegador; a volta só vale com os dois iguais, o `state` ainda não usado e a mesma Conta na
 * sessão, então ninguém liga o próprio Discord à Conta de outra pessoa (login CSRF). O token do
 * Discord é usado uma vez (ler o usuário e pôr no servidor) e descartado.
 */
export class DiscordLinkFlow {
  private readonly logger = new Logger(DiscordLinkFlow.name);

  constructor(
    private readonly valkey: Redis,
    private readonly client: DiscordClient,
    private readonly links: DiscordLinks,
    private readonly sync: DiscordRoleSync,
  ) {}

  /** Começa o vínculo da Conta: o `state` vai no cookie e o navegador, para `redirectUrl`. */
  async start(
    accountId: string,
    returnTo: string | undefined,
  ): Promise<{ state: string; redirectUrl: string }> {
    const state = randomToken();
    await this.valkey.set(
      `${STATE_PREFIX}${state}`,
      JSON.stringify({ accountId, returnTo: safeReturnPath(returnTo) }),
      'EX',
      DISCORD_FLOW_TTL_SECONDS,
    );
    return { state, redirectUrl: this.client.authorizeUrl(state) };
  }

  /**
   * Termina o vínculo com a volta do Discord. `query` traz `code`/`state`/`error`; `stateCookie`
   * é o cookie do navegador. O `state` é gasto mesmo se algo falhar depois.
   */
  async complete(
    accountId: string,
    stateCookie: string | undefined,
    query: { code?: string; state?: string; error?: string },
  ): Promise<DiscordLinkOutcome> {
    const state = query.state ?? '';
    if (!stateCookie || !sameToken(stateCookie, state)) {
      return { result: 'invalido', returnTo: '/' };
    }
    const stored = await this.valkey.getdel(`${STATE_PREFIX}${state}`);
    const parsed =
      stored === null ? null : (JSON.parse(stored) as { accountId: string; returnTo: string });
    if (parsed === null || parsed.accountId !== accountId) {
      return { result: 'invalido', returnTo: '/' };
    }
    const returnTo = safeReturnPath(parsed.returnTo);
    if (query.error !== undefined) return { result: 'cancelado', returnTo };
    if (!query.code) return { result: 'invalido', returnTo };

    let exchanged: Awaited<ReturnType<DiscordClient['exchangeCode']>>;
    try {
      exchanged = await this.client.exchangeCode(query.code);
    } catch (error) {
      this.logger.warn(`Troca do code do Discord falhou: ${(error as Error).message}`);
      return { result: 'indisponivel', returnTo };
    }
    try {
      await this.links.link(accountId, exchanged.user);
    } catch (error) {
      if (error instanceof DiscordAlreadyLinked) return { result: 'em-uso', returnTo };
      if (error instanceof AccountAlreadyLinked) return { result: 'conta-ja-vinculada', returnTo };
      throw error;
    }
    // O token do vínculo não é guardado, então é agora ou nunca para pôr a pessoa no servidor: se o
    // Discord falhar, o vínculo é desfeito e ela tenta de novo (o job só reaplica cargos).
    const outcome = await this.sync
      .reconcile(accountId, exchanged.accessToken)
      .catch((error: unknown) => {
        this.logger.warn(`Cargos do vínculo não aplicaram: ${(error as Error).message}`);
        return 'failed' as const;
      });
    if (outcome === 'failed') {
      await this.links.remove(accountId);
      return { result: 'indisponivel', returnTo };
    }
    return { result: 'vinculado', returnTo };
  }
}

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
