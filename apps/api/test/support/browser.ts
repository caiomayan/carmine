import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LightMyRequestResponse } from 'fastify';

export interface SetCookie {
  name: string;
  value: string;
  attributes: Record<string, string | true>;
}

/** Lê os `Set-Cookie` de uma resposta, com os atributos em minúsculas. */
export function setCookiesOf(response: LightMyRequestResponse): SetCookie[] {
  const header = response.headers['set-cookie'];
  const lines = header === undefined ? [] : Array.isArray(header) ? header : [String(header)];
  return lines.map((line) => {
    const [pair = '', ...attributes] = line.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    return {
      name: pair.slice(0, separator),
      value: decodeURIComponent(pair.slice(separator + 1)),
      attributes: Object.fromEntries(
        attributes.map((attribute) => {
          const [key = '', ...rest] = attribute.split('=');
          return [key.toLowerCase(), rest.length > 0 ? rest.join('=') : true];
        }),
      ),
    };
  });
}

/**
 * Um navegador mínimo sobre o `inject` do Fastify: guarda os cookies que a API define (e
 * apaga os expirados) e os manda de volta, como o navegador faz na mesma origem.
 */
export class Browser {
  readonly cookies = new Map<string, string>();

  constructor(private readonly app: NestFastifyApplication) {}

  async request(options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    payload?: object;
  }): Promise<LightMyRequestResponse> {
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const response = await this.app.inject({
      method: options.method ?? 'GET',
      url: options.url,
      headers: { ...(cookie && { cookie }), ...options.headers },
      ...(options.payload && { payload: options.payload }),
    });
    for (const { name, value, attributes } of setCookiesOf(response)) {
      const expired =
        attributes['max-age'] === '0' ||
        (typeof attributes.expires === 'string' && new Date(attributes.expires) <= new Date());
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, encodeURIComponent(value));
    }
    return response;
  }

  get(url: string, headers?: Record<string, string>) {
    return this.request({ url, ...(headers && { headers }) });
  }

  post(url: string, headers?: Record<string, string>, payload?: object) {
    return this.request({
      method: 'POST',
      url,
      ...(headers && { headers }),
      ...(payload && { payload }),
    });
  }

  cookie(name: string): string | undefined {
    const value = this.cookies.get(name);
    return value === undefined ? undefined : decodeURIComponent(value);
  }
}
