import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const FAKE_DISCORD_BOT_TOKEN = 'token-do-bot-falso';
export const FAKE_DISCORD_GUILD_ID = '900000000000000001';

export interface FakeDiscordUser {
  id: string;
  username: string;
}

export interface FakeDiscordRequest {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Imita o que a S15 usa do Discord (API REST v10) em HTTP local: troca de `code` por token,
 * `/users/@me`, membros do servidor e seus cargos, entrada por `guilds.join` e mensagens de canal.
 * Guarda tudo em memória para o teste conferir o estado "real" do servidor, e consegue responder
 * 429 como o Discord faz (`retry_after` no corpo e `Retry-After`).
 */
export class FakeDiscord {
  /** Membros do servidor: ID do usuário → IDs dos cargos. */
  readonly members = new Map<string, Set<string>>();
  /** Mensagens dos canais: ID → corpo da última versão (embeds). */
  readonly messages = new Map<string, { channelId: string; body: unknown; edits: number }>();
  readonly requests: FakeDiscordRequest[] = [];
  /** Quantas das próximas chamadas do bot respondem 429. */
  rateLimitNext = 0;
  /** Faz as chamadas de rede do bot falharem (500) enquanto verdadeiro. */
  broken = false;
  private readonly codes = new Map<string, FakeDiscordUser>();
  private nextMessageId = 700000000000000000n;
  private readonly server: Server;

  private constructor() {
    this.server = createServer((req, res) => void this.handle(req, res));
  }

  static async start(): Promise<FakeDiscord> {
    const fake = new FakeDiscord();
    await new Promise<void>((resolve) => fake.server.listen(0, '127.0.0.1', resolve));
    return fake;
  }

  get origin(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  get apiUrl(): string {
    return `${this.origin}/api/v10`;
  }

  get authorizeUrl(): string {
    return `${this.origin}/oauth2/authorize`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** O `code` que o Discord devolveria depois de a pessoa autorizar. */
  issueCode(user: FakeDiscordUser): string {
    const code = `code-${this.codes.size + 1}-${user.id}`;
    this.codes.set(code, user);
    return code;
  }

  /** A pessoa entra no servidor (ou já estava), com esses cargos. */
  join(userId: string, roles: string[] = []): void {
    this.members.set(userId, new Set(roles));
  }

  rolesOf(userId: string): string[] | null {
    const roles = this.members.get(userId);
    return roles ? [...roles].sort() : null;
  }

  /** As chamadas feitas, só método e caminho, na ordem. */
  calls(filter?: RegExp): string[] {
    return this.requests
      .map((r) => `${r.method} ${r.path}`)
      .filter((call) => (filter ? filter.test(call) : true));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString();
    const url = new URL(req.url ?? '/', this.origin);
    const path = url.pathname.replace('/api/v10', '');
    const contentType = req.headers['content-type'] ?? '';
    const body: unknown = raw
      ? contentType.includes('json')
        ? JSON.parse(raw)
        : Object.fromEntries(new URLSearchParams(raw))
      : undefined;
    const method = req.method ?? 'GET';
    this.requests.push({ method, path, body });

    const json = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(payload));
    };
    const empty = (status: number): void => void res.writeHead(status).end();

    if (path === '/oauth2/token' && method === 'POST') {
      const form = body as Record<string, string>;
      const user = this.codes.get(form.code ?? '');
      if (!user || form.client_secret !== 'segredo-do-cliente') {
        return json(400, { error: 'invalid_grant' });
      }
      this.codes.delete(form.code ?? '');
      return json(200, { access_token: `token-de-${user.id}`, token_type: 'Bearer' });
    }
    if (path === '/users/@me' && method === 'GET') {
      const id = /^Bearer token-de-(.+)$/.exec(req.headers.authorization ?? '')?.[1];
      return id ? json(200, { id, username: `user${id}`, global_name: `Nome ${id}` }) : empty(401);
    }

    // Daqui em diante, só o bot.
    if (req.headers.authorization !== `Bot ${FAKE_DISCORD_BOT_TOKEN}`) return empty(401);
    if (this.broken) return json(500, { message: 'quebrado' });
    if (this.rateLimitNext > 0) {
      this.rateLimitNext--;
      return json(
        429,
        { message: 'You are being rate limited.', retry_after: 0.05, global: false },
        { 'retry-after': '1' },
      );
    }

    const member = new RegExp(
      `^/guilds/${FAKE_DISCORD_GUILD_ID}/members/(\\d+)(?:/roles/(\\d+))?$`,
    ).exec(path);
    if (member) {
      const [, userId = '', roleId] = member;
      if (roleId === undefined && method === 'GET') {
        const roles = this.members.get(userId);
        return roles
          ? json(200, { user: { id: userId }, roles: [...roles] })
          : json(404, { code: 10007 });
      }
      if (roleId === undefined && method === 'PUT') {
        const token = (body as { access_token?: string } | undefined)?.access_token;
        if (token !== `token-de-${userId}`) return json(403, { message: 'token inválido' });
        if (this.members.has(userId)) return empty(204);
        this.members.set(userId, new Set());
        return json(201, { user: { id: userId }, roles: [] });
      }
      const roles = this.members.get(userId);
      if (!roles) return json(404, { code: 10007 });
      if (roleId !== undefined && method === 'PUT') roles.add(roleId);
      else if (roleId !== undefined && method === 'DELETE') roles.delete(roleId);
      else return empty(405);
      return empty(204);
    }

    const channel = /^\/channels\/(\d+)\/messages(?:\/(\d+))?$/.exec(path);
    if (channel) {
      const [, channelId = '', messageId] = channel;
      if (method === 'POST' && messageId === undefined) {
        const id = String(this.nextMessageId++);
        this.messages.set(id, { channelId, body, edits: 0 });
        return json(200, { id });
      }
      if (method === 'PATCH' && messageId !== undefined) {
        const message = this.messages.get(messageId);
        if (!message || message.channelId !== channelId) return json(404, { code: 10008 });
        this.messages.set(messageId, { channelId, body, edits: message.edits + 1 });
        return json(200, { id: messageId });
      }
    }
    return json(404, { message: `rota desconhecida ${method} ${path}` });
  }
}
