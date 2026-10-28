/**
 * O cliente HTTP mínimo do Mercado Pago (S14c): só `fetch`, o Access Token e os cabeçalhos que a documentação oficial
 * pede (`Authorization: Bearer`, `X-Idempotency-Key` nas escritas). Sem SDK: a API usa seis chamadas e o adaptador as
 * testa contra respostas gravadas da documentação (`mercadopago.spec.ts`). O token nunca entra em mensagem de erro.
 */

export const MERCADOPAGO_BASE_URL = 'https://api.mercadopago.com';

/** Uma resposta de erro do Mercado Pago (ou rede/tempo esgotado, com `status` 0). */
export class MercadoPagoError extends Error {
  constructor(
    /** O status HTTP; 0 quando nem chegou resposta (rede, tempo esgotado). */
    readonly status: number,
    /** O código do erro do Mercado Pago (`2000`, `4293`...), se veio. */
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'MercadoPagoError';
  }
}

export interface MercadoPagoClientOptions {
  accessToken: string;
  baseUrl?: string;
  /** Para os testes: o `fetch` que devolve as respostas gravadas. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface MercadoPagoRequest {
  /** Vai como `X-Idempotency-Key` (obrigatório nas criações de pagamento e de reembolso). */
  idempotencyKey?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class MercadoPagoClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: MercadoPagoClientOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.baseUrl = (options.baseUrl ?? MERCADOPAGO_BASE_URL).replace(/\/+$/, '');
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    request: MercadoPagoRequest = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [name, value] of Object.entries(request.query ?? {})) {
      url.searchParams.set(name, value);
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.options.accessToken}`,
      accept: 'application/json',
      ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(request.idempotencyKey ? { 'x-idempotency-key': request.idempotencyKey } : {}),
      ...request.headers,
    };
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers,
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new MercadoPagoError(
        0,
        null,
        `sem resposta do Mercado Pago (${(error as Error).name})`,
      );
    }
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text === '' ? null : JSON.parse(text);
    } catch {
      json = null;
    }
    if (!response.ok) throw errorOf(response.status, json);
    return json as T;
  }
}

/** O erro do corpo (`{ message, error, status, cause: [{ code, description }] }`), sem eco do que foi enviado. */
function errorOf(status: number, json: unknown): MercadoPagoError {
  const body = (typeof json === 'object' && json !== null ? json : {}) as {
    message?: unknown;
    error?: unknown;
    code?: unknown;
    cause?: unknown;
  };
  const cause = Array.isArray(body.cause)
    ? (body.cause[0] as { code?: unknown } | undefined)
    : undefined;
  const code = cause?.code ?? body.code ?? body.error;
  const message = typeof body.message === 'string' ? body.message.slice(0, 200) : `HTTP ${status}`;
  return new MercadoPagoError(
    status,
    code === undefined || code === null ? null : String(code),
    `Mercado Pago ${status}: ${message}`,
  );
}
