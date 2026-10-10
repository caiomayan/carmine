import { timingSafeEqual } from 'node:crypto';
import { CSRF_HEADER } from '@carmine/contracts';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { clearSessionCookies, SESSION_COOKIE, setSessionCookies } from './session-cookies.js';
import { type Session, SessionStore } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Sessão do site resolvida pelo {@link SessionGuard}; ausente para visitantes. */
    carmineSession?: Session;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Guard global: resolve a sessão do cookie em toda requisição e protege toda mutação contra
 * CSRF. Padrão escolhido: token sincronizador. Cada sessão tem um token aleatório guardado no
 * servidor; o web o lê do cookie `carmine_csrf` (ou de `GET /api/me`) e o devolve no cabeçalho
 * `x-csrf-token`, que é comparado com o da sessão. Outro site não lê nem o cookie nem a
 * resposta (mesma origem, sem CORS) e não consegue mandar cabeçalhos próprios num formulário,
 * e um cookie injetado não ajuda porque a comparação é com o servidor. Requisições com
 * `Sec-Fetch-Site: cross-site` são recusadas antes, como defesa extra.
 *
 * Só vale para requisições com o cookie de sessão: sem cookie não há autoridade ambiente a
 * roubar (os plugins usam a chave do servidor no cabeçalho `Authorization`). Uma sessão
 * expirada não é erro aqui; o cookie é apagado e a rota decide (as protegidas respondem 401).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  constructor(@Inject(SessionStore) private readonly sessions: SessionStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const id = request.cookies[SESSION_COOKIE];
    if (!id) {
      return true;
    }

    let found: Awaited<ReturnType<SessionStore['read']>>;
    try {
      found = await this.sessions.read(id);
    } catch (error) {
      this.logger.error(`Sessões indisponíveis: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Sessões indisponíveis no momento; tente de novo');
    }
    if (found === null) {
      clearSessionCookies(reply);
      return true;
    }
    if (found.renewed) {
      setSessionCookies(reply, found.session);
    }
    if (!SAFE_METHODS.has(request.method)) {
      assertCsrf(request, found.session);
    }
    request.carmineSession = found.session;
    return true;
  }
}

function assertCsrf(request: FastifyRequest, session: Session): void {
  if (request.headers['sec-fetch-site'] === 'cross-site') {
    throw new ForbiddenException('Requisição de outro site recusada');
  }
  const header = request.headers[CSRF_HEADER];
  const sent = Buffer.from(typeof header === 'string' ? header : '');
  const expected = Buffer.from(session.csrfToken);
  if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
    throw new ForbiddenException('Token CSRF ausente ou inválido');
  }
}

/** Só deixa passar quem tem sessão; sem sessão (ou com ela expirada): 401. */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!context.switchToHttp().getRequest<FastifyRequest>().carmineSession) {
      throw new UnauthorizedException('Sessão ausente ou expirada; entre de novo');
    }
    return true;
  }
}

/** A sessão da requisição (rotas com {@link AuthenticatedGuard}). */
export const CurrentSession = createParamDecorator(
  (_: unknown, context: ExecutionContext): Session => {
    const session = context.switchToHttp().getRequest<FastifyRequest>().carmineSession;
    if (!session) {
      throw new Error('CurrentSession usado numa rota sem o AuthenticatedGuard');
    }
    return session;
  },
);
