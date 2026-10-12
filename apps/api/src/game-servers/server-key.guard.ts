import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { type GameServer, GameServerRegistry } from './game-server-registry.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Servidor Carmine autenticado pelo {@link ServerKeyGuard}. */
    gameServer?: GameServer;
  }
}

/**
 * Só deixa passar Servidores Carmine, autenticados pela chave no cabeçalho
 * `Authorization: Bearer <chave>` (ADR 0005). Sem chave ou com chave inválida: 401.
 */
@Injectable()
export class ServerKeyGuard implements CanActivate {
  constructor(@Inject(GameServerRegistry) private readonly registry: GameServerRegistry) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const [scheme, key] = (request.headers.authorization ?? '').split(' ');
    const server =
      scheme?.toLowerCase() === 'bearer' && key ? await this.registry.authenticate(key) : null;
    if (!server) {
      throw new UnauthorizedException('Chave de Servidor Carmine ausente ou inválida');
    }
    request.gameServer = server;
    return true;
  }
}

/**
 * Como o {@link ServerKeyGuard}, mas aceita também a chave no campo `apiKey` do corpo JSON: é
 * onde o cs2-css-inventory-simulator, sem modificação, manda o `invsim_apikey` (ADR 0006).
 */
@Injectable()
export class InvsimKeyGuard implements CanActivate {
  constructor(@Inject(GameServerRegistry) private readonly registry: GameServerRegistry) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const [scheme, bearer] = (request.headers.authorization ?? '').split(' ');
    const body = request.body as { apiKey?: unknown } | undefined;
    const key =
      scheme?.toLowerCase() === 'bearer' && bearer
        ? bearer
        : typeof body?.apiKey === 'string'
          ? body.apiKey
          : '';
    const server = key ? await this.registry.authenticate(key) : null;
    if (!server) {
      throw new UnauthorizedException('Chave de Servidor Carmine ausente ou inválida');
    }
    request.gameServer = server;
    return true;
  }
}

/** O Servidor Carmine autenticado pelo `ServerKeyGuard`. */
export const CurrentGameServer = createParamDecorator(
  (_: unknown, context: ExecutionContext): GameServer => {
    const server = context.switchToHttp().getRequest<FastifyRequest>().gameServer;
    if (!server) {
      throw new Error('CurrentGameServer usado numa rota sem o ServerKeyGuard');
    }
    return server;
  },
);
