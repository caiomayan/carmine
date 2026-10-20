import {
  DiscordApiError,
  type DiscordClient,
  type DiscordMessage,
  type DiscordUser,
} from './discord-client.js';

export interface DiscordRestOptions {
  clientId: string;
  clientSecret: string;
  botToken: string;
  guildId: string;
  /** Base da API REST (`https://discord.com/api/v10`). */
  apiUrl: string;
  authorizeUrl: string;
  /** O redirect_uri fixo do OAuth2 (precisa ser igual ao cadastrado no Developer Portal). */
  redirectUri: string;
  timeoutMs?: number;
  /** Quantas vezes uma chamada espera um 429 e tenta de novo antes de desistir. */
  maxRateLimitRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Espera máxima por um 429: acima disso a chamada falha e o job tenta no próximo ciclo. */
const MAX_WAIT_MS = 30_000;

/**
 * O Discord por REST (API v10), sem gateway. Respeita o rate limit: guarda por rota o
 * `X-RateLimit-Remaining`/`Reset-After` e espera o reinício antes de gastar o último pedido; num
 * 429 espera o `retry_after` (ou `Retry-After`) e repete. Um 429 global trava todas as rotas.
 */
export class DiscordRest implements DiscordClient {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  /** Rota → quando o balde dela volta a ter pedidos (só enquanto está zerado). */
  private readonly blockedUntil = new Map<string, number>();
  private globalBlockedUntil = 0;

  constructor(private readonly options: DiscordRestOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRateLimitRetries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  authorizeUrl(state: string): string {
    const url = new URL(this.options.authorizeUrl);
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.options.redirectUri);
    url.searchParams.set('scope', 'identify guilds.join');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'none');
    return url.toString();
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; user: DiscordUser }> {
    const tokenResponse = await this.send('oauth', 'POST', '/oauth2/token', {
      auth: null,
      form: {
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.options.redirectUri,
      },
    });
    const token = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof token.access_token !== 'string') {
      throw new DiscordApiError('resposta do token sem access_token', tokenResponse.status);
    }
    const meResponse = await this.send('oauth-me', 'GET', '/users/@me', {
      auth: `Bearer ${token.access_token}`,
    });
    const me = (await meResponse.json()) as {
      id?: unknown;
      username?: unknown;
      global_name?: unknown;
    };
    if (typeof me.id !== 'string' || typeof me.username !== 'string') {
      throw new DiscordApiError('resposta de /users/@me sem id ou username', meResponse.status);
    }
    const name =
      typeof me.global_name === 'string' && me.global_name ? me.global_name : me.username;
    return { accessToken: token.access_token, user: { id: me.id, username: name } };
  }

  async memberRoles(userId: string): Promise<string[] | null> {
    const response = await this.bot('member', 'GET', `/guilds/${this.guild}/members/${userId}`, {
      okStatuses: [404],
    });
    if (response.status === 404) return null;
    const member = (await response.json()) as { roles?: unknown };
    return Array.isArray(member.roles) ? member.roles.map(String) : [];
  }

  async joinGuild(userId: string, accessToken: string): Promise<void> {
    await this.bot('join', 'PUT', `/guilds/${this.guild}/members/${userId}`, {
      json: { access_token: accessToken },
    });
  }

  addRole(userId: string, roleId: string, reason: string): Promise<boolean> {
    return this.changeRole('PUT', userId, roleId, reason);
  }

  removeRole(userId: string, roleId: string, reason: string): Promise<boolean> {
    return this.changeRole('DELETE', userId, roleId, reason);
  }

  async postMessage(channelId: string, message: DiscordMessage): Promise<string> {
    const response = await this.bot('post', 'POST', `/channels/${channelId}/messages`, {
      json: withoutMentions(message),
    });
    const created = (await response.json()) as { id?: unknown };
    if (typeof created.id !== 'string') {
      throw new DiscordApiError('resposta da mensagem sem id', response.status);
    }
    return created.id;
  }

  async editMessage(
    channelId: string,
    messageId: string,
    message: DiscordMessage,
  ): Promise<boolean> {
    const response = await this.bot(
      'edit',
      'PATCH',
      `/channels/${channelId}/messages/${messageId}`,
      { json: withoutMentions(message), okStatuses: [404] },
    );
    return response.status !== 404;
  }

  private get guild(): string {
    return this.options.guildId;
  }

  private async changeRole(
    method: 'PUT' | 'DELETE',
    userId: string,
    roleId: string,
    reason: string,
  ): Promise<boolean> {
    const response = await this.bot(
      'role',
      method,
      `/guilds/${this.guild}/members/${userId}/roles/${roleId}`,
      { okStatuses: [404], reason },
    );
    return response.status !== 404;
  }

  private bot(
    route: string,
    method: string,
    path: string,
    init: { json?: object; okStatuses?: number[]; reason?: string } = {},
  ): Promise<Response> {
    return this.send(`${route}:${this.guild}`, method, path, {
      auth: `Bot ${this.options.botToken}`,
      ...init,
    });
  }

  /**
   * Um pedido com o controle de rate limit. `okStatuses` são respostas de erro esperadas (404)
   * que o chamador trata; qualquer outro não-2xx vira {@link DiscordApiError}.
   */
  private async send(
    bucket: string,
    method: string,
    path: string,
    init: {
      auth: string | null;
      json?: object;
      form?: Record<string, string>;
      okStatuses?: number[];
      reason?: string;
    },
  ): Promise<Response> {
    const key = `${method} ${bucket}`;
    for (let attempt = 0; ; attempt++) {
      await this.waitForBucket(key);
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.options.apiUrl}${path}`, {
          method,
          headers: {
            ...(init.auth && { authorization: init.auth }),
            'user-agent': 'DiscordBot (https://stcarmine.com, 1)',
            ...(init.json && { 'content-type': 'application/json' }),
            ...(init.form && { 'content-type': 'application/x-www-form-urlencoded' }),
            ...(init.reason && { 'x-audit-log-reason': encodeURIComponent(init.reason) }),
          },
          ...(init.json && { body: JSON.stringify(init.json) }),
          ...(init.form && { body: new URLSearchParams(init.form).toString() }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        throw new DiscordApiError(`Discord indisponível: ${(error as Error).message}`, null);
      }
      this.learn(key, response);
      if (response.status === 429) {
        const wait = await this.retryAfterMs(response);
        if (attempt >= this.maxRetries || wait > MAX_WAIT_MS) {
          throw new DiscordApiError(`Discord limitou ${method} ${path} (429)`, 429);
        }
        this.blockedUntil.set(key, this.now() + wait);
        continue;
      }
      if (response.ok || init.okStatuses?.includes(response.status)) return response;
      throw new DiscordApiError(
        `Discord recusou ${method} ${path}: HTTP ${response.status}`,
        response.status,
      );
    }
  }

  private async waitForBucket(key: string): Promise<void> {
    const until = Math.max(this.globalBlockedUntil, this.blockedUntil.get(key) ?? 0);
    const wait = until - this.now();
    if (wait > 0) await this.sleep(wait);
  }

  /** Guarda o balde: com `Remaining: 0`, a próxima chamada da rota espera o `Reset-After`. */
  private learn(key: string, response: Response): void {
    if (response.headers.get('x-ratelimit-remaining') === '0') {
      const resetAfter = Number(response.headers.get('x-ratelimit-reset-after'));
      if (Number.isFinite(resetAfter) && resetAfter > 0) {
        this.blockedUntil.set(key, this.now() + Math.ceil(resetAfter * 1000));
      }
    }
  }

  private async retryAfterMs(response: Response): Promise<number> {
    const body = (await response.json().catch(() => null)) as {
      retry_after?: unknown;
      global?: unknown;
    } | null;
    const seconds = Number(body?.retry_after ?? response.headers.get('retry-after') ?? 1);
    const wait = Math.ceil((Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000);
    if (body?.global === true) this.globalBlockedUntil = this.now() + wait;
    return wait;
  }
}

/** Mensagem do bot nunca marca ninguém. */
function withoutMentions(message: DiscordMessage): object {
  return { ...message, allowed_mentions: { parse: [] } };
}
