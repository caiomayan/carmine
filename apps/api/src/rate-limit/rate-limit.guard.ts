import { createHash } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CF_CONNECTING_IP, ClientIpResolver } from '../client-ip/client-ip.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { ipBucket } from './ip-bucket.js';
import {
  RATE_LIMIT_PERIOD_SECONDS,
  RATE_LIMIT_POLICIES,
  type RateLimitPolicyName,
  type RateLimitSubject,
} from './policies.js';
import { RateLimiter } from './rate-limiter.js';

export const RATE_LIMIT_POLICY = Symbol('RATE_LIMIT_POLICY');

/** Com o Valkey fora, um aviso a cada tanto, não um por requisição. */
const UNAVAILABLE_LOG_EVERY_MS = 30_000;

/** Aplica a política de `@RateLimit` da rota (ver `rate-limit.decorator.ts`). */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private lastUnavailableLog = 0;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(ClientIpResolver) private readonly clientIp: ClientIpResolver,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = this.reflector.get<RateLimitPolicyName | undefined>(
      RATE_LIMIT_POLICY,
      context.getHandler(),
    );
    if (name === undefined || context.getType() !== 'http') {
      return true;
    }
    const policy = RATE_LIMIT_POLICIES[name];
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    const limit = this.config.rateLimitsPerMinute[name];
    const decision = await this.limiter.consume(
      `${name}:${this.subjectOf(policy.subject, request)}`,
      {
        limit,
        periodSeconds: RATE_LIMIT_PERIOD_SECONDS,
      },
    );

    if (decision.outcome === 'unavailable') {
      this.warnUnavailable(name, policy.whenUnavailable);
      if (policy.whenUnavailable === 'allow') {
        return true;
      }
      throw new ServiceUnavailableException('Serviço indisponível no momento; tente de novo');
    }

    reply.header('RateLimit-Policy', `"${name}";q=${limit};w=${RATE_LIMIT_PERIOD_SECONDS}`);
    if (decision.outcome === 'allowed') {
      reply.header('RateLimit', `"${name}";r=${decision.remaining};t=${decision.resetSeconds}`);
      return true;
    }
    // Recusado: o Retry-After vale (e o t aponta para o mesmo instante, a próxima vaga).
    const retryAfter = decision.retryAfterSeconds;
    reply.header('RateLimit', `"${name}";r=0;t=${retryAfter}`);
    reply.header('Retry-After', String(retryAfter));
    throw new HttpException(
      `Muitas requisições; tente de novo em ${retryAfter} s`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private subjectOf(subject: RateLimitSubject, request: FastifyRequest): string {
    if (subject === 'gameServer') {
      if (!request.gameServer) {
        throw new Error('Política por Servidor Carmine numa rota sem o ServerKeyGuard');
      }
      return `server:${request.gameServer.id}`;
    }
    if (subject === 'session' && request.carmineSession) {
      // Só o hash: o id da sessão nunca vai para o Valkey em claro.
      const hash = createHash('sha256').update(request.carmineSession.id).digest('hex');
      return `session:${hash.slice(0, 32)}`;
    }
    const ip = this.clientIp.resolve(
      request.socket.remoteAddress,
      request.headers[CF_CONNECTING_IP],
    );
    return `ip:${ipBucket(ip)}`;
  }

  private warnUnavailable(name: RateLimitPolicyName, mode: 'allow' | 'deny'): void {
    const now = Date.now();
    if (now - this.lastUnavailableLog < UNAVAILABLE_LOG_EVERY_MS) {
      return;
    }
    this.lastUnavailableLog = now;
    this.logger.warn(
      `Rate limit sem Valkey (política "${name}": ${mode === 'allow' ? 'aberta' : 'fechada'})`,
    );
  }
}
