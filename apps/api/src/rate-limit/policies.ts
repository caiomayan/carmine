/** De quem é o balde de uma requisição. */
export type RateLimitSubject =
  /** O IP real do visitante (ver `ClientIpResolver`); IPv6 agrupado pelo /64. */
  | 'ip'
  /** A sessão do site; sem sessão, o IP. */
  | 'session'
  /** O Servidor Carmine autenticado pela chave (rota com `ServerKeyGuard`). */
  | 'gameServer';

export interface RateLimitPolicy {
  subject: RateLimitSubject;
  /**
   * Com o Valkey fora, sem como contar: `allow` deixa passar sem limite, `deny` responde 503.
   */
  whenUnavailable: 'allow' | 'deny';
}

/**
 * As políticas de rate limit da API, aplicadas por rota com `@RateLimit('<nome>')`. O limite
 * (requisições por minuto) vem da configuração (`RATE_LIMIT_<NOME>_PER_MINUTE`).
 *
 * Falha segura com o Valkey fora: a leitura pública e os plugins ficam abertos (o site e os
 * Servidores Carmine continuam de pé, e o Postgres não depende do Valkey); o login e as
 * mutações ficam fechados, porque dependem do Valkey de qualquer jeito (state do login, nonce
 * e sessão) e deixá-los sem contagem só abriria espaço para abuso sem ganhar disponibilidade.
 */
export const RATE_LIMIT_POLICIES = {
  /** Início e volta do login Steam: cada volta custa uma ida à Steam (check_authentication). */
  login: { subject: 'ip', whenUnavailable: 'deny' },
  /** Leituras públicas do site (Perfis, `/api/me`, servidores ao vivo e amigos jogando). */
  public: { subject: 'ip', whenUnavailable: 'allow' },
  /** `equipped/v5`: o servidor de jogo pede pelos jogadores todos, de um IP só. */
  equipped: { subject: 'ip', whenUnavailable: 'allow' },
  /** Mutações do site, com sessão. */
  mutations: { subject: 'session', whenUnavailable: 'deny' },
  /** Rotas dos plugins (`/api/server/*`). */
  server: { subject: 'gameServer', whenUnavailable: 'allow' },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

/** Todos os limites valem por minuto. */
export const RATE_LIMIT_PERIOD_SECONDS = 60;
