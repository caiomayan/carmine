import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const SIGNED_FIELDS = [
  'signed',
  'op_endpoint',
  'claimed_id',
  'identity',
  'return_to',
  'response_nonce',
  'assoc_handle',
];

export type FakeSteamOpenIdBehavior = 'ok' | 'error' | 'hang';

/** Cookie (no host da Steam falsa) com o SteamID64 que entra nesse navegador. */
export const FAKE_STEAM_ID_COOKIE = 'fake_steam_id';
/** Cookie (no host da Steam falsa): `cancel` faz a pessoa "desistir" na Steam. */
export const FAKE_STEAM_ACTION_COOKIE = 'fake_steam_action';

/**
 * Imita o provedor OpenID 2.0 da Steam (`https://steamcommunity.com/openid/login`) com uma
 * chave HMAC própria, para os testes não dependerem da Steam real:
 *
 * - `GET /openid/login` (checkid_setup): "aprova" o login de {@link steamId} e volta ao
 *   `return_to` com a asserção assinada, como a Steam faz depois de a pessoa entrar;
 * - `POST /openid/login` (check_authentication): confere a assinatura que ela mesma emitiu.
 *
 * Como a Steam real, não impede replay: verificar a mesma asserção duas vezes dá `is_valid:true`
 * as duas vezes. Quem impede é a API.
 */
export class FakeSteamOpenId {
  behavior: FakeSteamOpenIdBehavior = 'ok';
  /** Quem "entra" na próxima visita a `GET /openid/login` (sem o cookie {@link FAKE_STEAM_ID_COOKIE}). */
  steamId = '76561198000000001';
  /** Pedidos de check_authentication recebidos. */
  readonly verifications: URLSearchParams[] = [];
  /** Pedidos de checkid_setup recebidos (o redirecionamento do login). */
  readonly logins: URL[] = [];
  private readonly key = randomBytes(32);
  private readonly server: Server;

  private constructor() {
    this.server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://fake-steam');
      if (url.pathname !== '/openid/login') {
        res.writeHead(404).end();
        return;
      }
      if (req.method === 'GET') {
        this.logins.push(url);
        const returnTo = url.searchParams.get('openid.return_to');
        if (url.searchParams.get('openid.mode') !== 'checkid_setup' || !returnTo) {
          res.writeHead(400).end();
          return;
        }
        // O navegador pode escolher quem entra (e se desiste) por cookies no host da Steam
        // falsa: o E2E do web loga Contas diferentes em paralelo sem reiniciar o processo.
        const cookies = parseCookies(req.headers.cookie);
        if (cookies[FAKE_STEAM_ACTION_COOKIE] === 'cancel') {
          const cancel = new URL(returnTo);
          cancel.searchParams.set('openid.ns', OPENID_NS);
          cancel.searchParams.set('openid.mode', 'cancel');
          res.writeHead(302, { location: cancel.toString() }).end();
          return;
        }
        const steamId = cookies[FAKE_STEAM_ID_COOKIE];
        res
          .writeHead(302, {
            location: this.positiveAssertionUrl(
              returnTo,
              steamId && /^\d{17}$/.test(steamId) ? { steamId } : undefined,
            ),
          })
          .end();
        return;
      }

      const body = new URLSearchParams(await readBody(req));
      this.verifications.push(body);
      if (this.behavior === 'hang') {
        return; // nunca responde: a API tem de desistir pelo timeout.
      }
      if (this.behavior === 'error') {
        res.writeHead(503).end();
        return;
      }
      const valid = body.get('openid.mode') === 'check_authentication' && this.isSignedByMe(body);
      res
        .writeHead(200, { 'content-type': 'text/plain' })
        .end(`ns:${OPENID_NS}\nis_valid:${valid}\n`);
    });
  }

  static async start(port = 0): Promise<FakeSteamOpenId> {
    const fake = new FakeSteamOpenId();
    await new Promise<void>((resolve) => fake.server.listen(port, '127.0.0.1', resolve));
    return fake;
  }

  /** Endpoint OpenID desta Steam falsa (vai em `STEAM_OPENID_URL`). */
  get endpoint(): string {
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/openid/login`;
  }

  /**
   * Asserção positiva assinada, como a Steam devolve no `return_to`. `overrides` troca campos
   * depois de assinar (simula adulteração); `sign` troca antes (asserção válida, mas com outro
   * conteúdo, ex.: um `return_to` de outro site).
   */
  assertionFor(
    returnTo: string,
    options: {
      steamId?: string;
      nonce?: string;
      sign?: Record<string, string>;
      overrides?: Record<string, string>;
    } = {},
  ): URLSearchParams {
    const steamId = options.steamId ?? this.steamId;
    const claimedId = `https://steamcommunity.com/openid/id/${steamId}`;
    const fields: Record<string, string> = {
      ns: OPENID_NS,
      mode: 'id_res',
      op_endpoint: this.endpoint,
      claimed_id: claimedId,
      identity: claimedId,
      return_to: returnTo,
      response_nonce: options.nonce ?? FakeSteamOpenId.nonce(),
      assoc_handle: '1234567890',
      signed: SIGNED_FIELDS.join(','),
      ...options.sign,
    };
    fields.sig = this.signature(fields);
    Object.assign(fields, options.overrides);
    return new URLSearchParams(
      Object.entries(fields).map(([name, value]): [string, string] => [`openid.${name}`, value]),
    );
  }

  /** O `return_to` com a asserção, como a Steam redireciona o navegador de volta. */
  positiveAssertionUrl(returnTo: string, options?: Parameters<typeof this.assertionFor>[1]) {
    const url = new URL(returnTo);
    for (const [name, value] of this.assertionFor(returnTo, options)) {
      url.searchParams.append(name, value);
    }
    return url.toString();
  }

  /** `response_nonce` no formato da Steam: horário UTC em segundos + sufixo único. */
  static nonce(at = new Date()): string {
    return `${at.toISOString().replace(/\.\d{3}Z$/, 'Z')}${randomBytes(8).toString('hex')}`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private signature(fields: Record<string, string>): string {
    const signed = (fields.signed ?? '').split(',');
    const message = signed.map((name) => `${name}:${fields[name] ?? ''}\n`).join('');
    return createHmac('sha256', this.key).update(message, 'utf8').digest('base64');
  }

  private isSignedByMe(body: URLSearchParams): boolean {
    const fields: Record<string, string> = {};
    for (const [name, value] of body) {
      if (name.startsWith('openid.')) fields[name.slice('openid.'.length)] = value;
    }
    const expected = Buffer.from(this.signature(fields));
    const actual = Buffer.from(fields.sig ?? '');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(value.join('='));
  }
  return cookies;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
