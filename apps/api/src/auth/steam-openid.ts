import { steamId64Schema } from '@carmine/contracts';

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
/** Campos que a Steam assina e que precisamos ver assinados para confiar neles. */
const REQUIRED_SIGNED = [
  'op_endpoint',
  'claimed_id',
  'identity',
  'return_to',
  'response_nonce',
  'assoc_handle',
];
/** `response_nonce`: horário UTC em segundos (`2026-10-10T18:00:00Z`) + sufixo único. */
const NONCE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)(.{1,200})$/;

/** Por que uma volta da Steam não virou login. */
export type OpenIdFailure =
  /** A pessoa desistiu na Steam (`openid.mode=cancel`). */
  | { reason: 'cancelled' }
  /** Asserção malformada, adulterada, de outro site, velha ou repetida. */
  | { reason: 'invalid'; detail: string }
  /** A Steam não respondeu à verificação. */
  | { reason: 'unavailable'; detail: string };

export type OpenIdResult = { ok: true; steamId: string } | ({ ok: false } & OpenIdFailure);

/** Registro de `response_nonce` já usados: cada asserção vale um login só. */
export interface NonceRegistry {
  /** `true` se o nonce era inédito (e agora fica marcado por `ttlSeconds`). */
  claim(nonce: string, ttlSeconds: number): Promise<boolean>;
}

export interface SteamOpenIdOptions {
  /** Endpoint OpenID da Steam (`https://steamcommunity.com/openid/login`). */
  endpoint: string;
  /** Realm: a origem pública do web (`https://stcarmine.com`). */
  realm: string;
  /** URL pública do callback, sem query (`https://stcarmine.com/api/auth/steam/callback`). */
  callbackUrl: string;
  timeoutMs: number;
  /** Idade máxima aceita de uma asserção (pelo horário do nonce). */
  maxAssertionAgeMs: number;
}

/** Folga para relógios adiantados (o nosso ou o da Steam). */
const CLOCK_SKEW_MS = 60_000;

/**
 * Relying party do OpenID 2.0 da Steam: monta o redirecionamento para a Steam e verifica a
 * asserção que volta no callback. A verificação confere tudo localmente (modo, namespace,
 * op_endpoint, return_to dentro do realm e igual à URL recebida, formato do claimed_id, campos
 * assinados e idade do nonce), confirma a assinatura com a própria Steam
 * (`check_authentication`, sempre no endpoint configurado, nunca no que veio na asserção) e só
 * então gasta o nonce, que não vale uma segunda vez.
 */
export class SteamOpenId {
  constructor(
    private readonly options: SteamOpenIdOptions,
    private readonly nonces: NonceRegistry,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** URL da Steam para onde o navegador vai; `returnQuery` volta intacta no callback. */
  loginUrl(returnQuery: Record<string, string>): string {
    const returnTo = new URL(this.options.callbackUrl);
    for (const [name, value] of Object.entries(returnQuery)) {
      returnTo.searchParams.set(name, value);
    }
    const url = new URL(this.options.endpoint);
    url.search = new URLSearchParams({
      'openid.ns': OPENID_NS,
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo.toString(),
      'openid.realm': this.options.realm,
      'openid.identity': IDENTIFIER_SELECT,
      'openid.claimed_id': IDENTIFIER_SELECT,
    }).toString();
    return url.toString();
  }

  /** Verifica a volta da Steam; `received` é a URL pública completa do callback. */
  async verify(received: URL): Promise<OpenIdResult> {
    const params = received.searchParams;
    const field = (name: string) => params.get(`openid.${name}`);
    const invalid = (detail: string): OpenIdResult => ({ ok: false, reason: 'invalid', detail });

    if (field('mode') === 'cancel') {
      return { ok: false, reason: 'cancelled' };
    }
    if (field('mode') !== 'id_res') {
      return invalid(`openid.mode inesperado: ${field('mode')}`);
    }
    if (field('ns') !== OPENID_NS) {
      return invalid('openid.ns não é OpenID 2.0');
    }
    if (field('op_endpoint') !== this.options.endpoint) {
      return invalid('openid.op_endpoint não é a Steam');
    }
    const returnToProblem = this.checkReturnTo(field('return_to'), received);
    if (returnToProblem) {
      return invalid(returnToProblem);
    }
    const claimedId = field('claimed_id') ?? '';
    const steamId = CLAIMED_ID.exec(claimedId)?.[1];
    if (
      !steamId ||
      field('identity') !== claimedId ||
      !steamId64Schema.safeParse(steamId).success
    ) {
      return invalid('openid.claimed_id não é um SteamID64 da Steam');
    }
    const signed = new Set((field('signed') ?? '').split(','));
    if (!REQUIRED_SIGNED.every((name) => signed.has(name)) || !field('sig')) {
      return invalid('asserção sem a assinatura dos campos obrigatórios');
    }
    const nonce = field('response_nonce') ?? '';
    const nonceProblem = this.checkNonceAge(nonce);
    if (nonceProblem) {
      return invalid(nonceProblem);
    }

    const rejection = await this.checkAuthentication(params);
    if (rejection) {
      return rejection;
    }

    // Só depois da Steam confirmar: uma asserção forjada não gasta o nonce de ninguém.
    const ttlSeconds = Math.ceil((this.options.maxAssertionAgeMs + CLOCK_SKEW_MS) / 1000);
    if (!(await this.nonces.claim(`${this.options.endpoint} ${nonce}`, ttlSeconds))) {
      return invalid('response_nonce repetido (replay)');
    }
    return { ok: true, steamId };
  }

  /**
   * O `return_to` assinado tem de ser o nosso callback, dentro do realm, e cada parâmetro dele
   * tem de estar igual na URL recebida (OpenID 2.0, 11.1): uma asserção emitida para outro site
   * ou para outro fluxo de login não serve aqui.
   */
  private checkReturnTo(returnTo: string | null, received: URL): string | null {
    let url: URL;
    try {
      url = new URL(returnTo ?? '');
    } catch {
      return 'openid.return_to ausente ou inválido';
    }
    const callback = new URL(this.options.callbackUrl);
    if (url.origin !== new URL(this.options.realm).origin || url.origin !== callback.origin) {
      return 'openid.return_to fora do realm';
    }
    if (url.pathname !== callback.pathname || received.pathname !== callback.pathname) {
      return 'openid.return_to não é o callback do login';
    }
    for (const [name, value] of url.searchParams) {
      if (received.searchParams.get(name) !== value) {
        return `openid.return_to não confere com a URL recebida (${name})`;
      }
    }
    return null;
  }

  private checkNonceAge(nonce: string): string | null {
    const issuedAt = Date.parse(NONCE.exec(nonce)?.[1] ?? '');
    if (Number.isNaN(issuedAt)) {
      return 'openid.response_nonce malformado';
    }
    const age = this.now().getTime() - issuedAt;
    if (age > this.options.maxAssertionAgeMs || age < -CLOCK_SKEW_MS) {
      return 'asserção expirada';
    }
    return null;
  }

  /**
   * Pergunta à Steam se a assinatura é dela, com os mesmos campos `openid.*` recebidos;
   * `null` quando ela confirma.
   */
  private async checkAuthentication(
    params: URLSearchParams,
  ): Promise<({ ok: false } & OpenIdFailure) | null> {
    const body = new URLSearchParams();
    for (const [name, value] of params) {
      if (name.startsWith('openid.')) body.append(name, value);
    }
    body.set('openid.mode', 'check_authentication');

    let text: string;
    try {
      const response = await fetch(this.options.endpoint, {
        method: 'POST',
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
      if (!response.ok) {
        return {
          ok: false,
          reason: 'unavailable',
          detail: `check_authentication: HTTP ${response.status}`,
        };
      }
      text = await response.text();
    } catch (error) {
      return {
        ok: false,
        reason: 'unavailable',
        detail: `check_authentication: ${(error as Error).message}`,
      };
    }

    const answer = new Map(
      text
        .split('\n')
        .map((line) => line.split(':'))
        .filter((parts) => parts.length >= 2)
        .map(([key = '', ...rest]) => [key.trim(), rest.join(':').trim()]),
    );
    if (answer.get('ns') !== OPENID_NS || answer.get('is_valid') !== 'true') {
      return { ok: false, reason: 'invalid', detail: 'a Steam não reconheceu a assinatura' };
    }
    return null;
  }
}
