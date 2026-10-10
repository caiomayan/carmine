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

type RequestWithGameServer = FastifyRequest & { gameServer?: GameServer };

/**
 * Só deixa passar Servidores Carmine, autenticados pela chave no cabeçalho
 * `Authorization: Bearer <chave>` (ADR 0005). Sem chave ou com chave inválida: 401.
 */
@Injectable()
export class ServerKeyGuard implements CanActivate {
  constructor(@Inject(GameServerRegistry) private readonly registry: GameServerRegistry) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithGameServer>();
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

/** O Servidor Carmine autenticado pelo `ServerKeyGuard`. */
export const CurrentGameServer = createParamDecorator(
  (_: unknown, context: ExecutionContext): GameServer => {
    const server = context.switchToHttp().getRequest<RequestWithGameServer>().gameServer;
    if (!server) {
      throw new Error('CurrentGameServer usado numa rota sem o ServerKeyGuard');
    }
    return server;
  },
);
