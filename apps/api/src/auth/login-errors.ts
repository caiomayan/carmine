import {
  DEFAULT_RETURN_PATH,
  LOGIN_ERROR_PATH,
  type LoginError,
  safeReturnPath,
} from '@carmine/contracts';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { RateLimitExceeded } from '../rate-limit/rate-limit.guard.js';

/** `/entrar?erro=<motivo>[&voltar=<página de origem>]` no web. */
export function loginErrorUrl(publicWebUrl: string, error: LoginError, returnTo: string): string {
  const url = new URL(LOGIN_ERROR_PATH, publicWebUrl);
  url.searchParams.set('erro', error);
  if (returnTo !== DEFAULT_RETURN_PATH) {
    url.searchParams.set('voltar', returnTo);
  }
  return url.toString();
}

/**
 * As rotas do login são navegações do navegador: acima do limite, em vez do 429 em JSON (que
 * em produção chegaria cru, porque o túnel manda `/api` direto para a API), a pessoa volta a
 * `/entrar?erro=limite`, com a página de origem quando o início do login a trouxe.
 */
@Catch(RateLimitExceeded)
export class LoginRateLimitFilter implements ExceptionFilter {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  catch(exception: RateLimitExceeded, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const { returnTo } = (request.query ?? {}) as { returnTo?: string };
    reply
      .header('Retry-After', String(exception.retryAfterSeconds))
      .redirect(
        loginErrorUrl(this.config.publicWebUrl, 'limite', safeReturnPath(returnTo)),
        HttpStatus.FOUND,
      );
  }
}
