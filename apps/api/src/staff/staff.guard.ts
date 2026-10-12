import { type StaffPermission, type StaffRole, staffCan } from '@carmine/contracts';
import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiCookieAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccountsService } from '../accounts/accounts.service.js';
import { StaffRejection } from './staff-errors.js';
import { StaffRoles } from './staff-roles.js';

/** Quem da Staff está agindo: a Conta da sessão e o papel dela. */
export interface StaffActor {
  accountId: string;
  steamId: string;
  role: StaffRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolvido pelo {@link StaffGuard}. */
    staffActor?: StaffActor;
  }
}

const STAFF_PERMISSION = 'carmine:staffPermission';

/**
 * Só a Staff com o papel que tem `permission` (`STAFF_PERMISSIONS`): sem sessão, 401; sem papel ou
 * sem a permissão, 403 `forbidden`. Use no método, acima do `@RateLimit` (o limite conta antes).
 */
export function StaffOnly(permission: StaffPermission): MethodDecorator {
  return applyDecorators(
    SetMetadata(STAFF_PERMISSION, permission),
    UseGuards(StaffGuard),
    ApiCookieAuth(),
    ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' }),
    ApiForbiddenResponse({ description: `Sem papel de Staff com a permissão "${permission}"` }),
  );
}

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(StaffRoles) private readonly roles: StaffRoles,
    @Inject(AccountsService) private readonly accounts: AccountsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const session = request.carmineSession;
    if (!session) {
      throw new UnauthorizedException('Sessão ausente ou expirada; entre de novo');
    }
    const permission = this.reflector.get<StaffPermission>(STAFF_PERMISSION, context.getHandler());
    const [role, account] = await Promise.all([
      this.roles.roleOf(session.accountId),
      this.accounts.findById(session.accountId),
    ]);
    if (!account || !role || !staffCan(role, permission)) {
      throw new StaffRejection('forbidden', `Seu papel não permite "${permission}"`);
    }
    request.staffActor = { accountId: account.id, steamId: account.steamId, role };
    return true;
  }
}

/** Quem da Staff está agindo (rotas com {@link StaffOnly}). */
export const CurrentStaff = createParamDecorator(
  (_: unknown, context: ExecutionContext): StaffActor => {
    const actor = context.switchToHttp().getRequest<FastifyRequest>().staffActor;
    if (!actor) throw new Error('CurrentStaff usado numa rota sem o StaffOnly');
    return actor;
  },
);
