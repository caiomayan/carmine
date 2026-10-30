import { DEFAULT_RETURN_PATH, safeReturnPath } from '@carmine/contracts';
import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Logger,
  Query,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import { ApiFoundResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AccountsService } from '../accounts/accounts.service.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { StaffRoles } from '../staff/staff-roles.js';
import { LoginRateLimitFilter } from './login-errors.js';
import {
  LOGIN_STATE_COOKIE,
  LOGIN_STATE_PATH,
  SESSION_COOKIE,
  setSessionCookies,
} from './session-cookies.js';
import { SessionStore } from './sessions.js';
import { LOGIN_FLOW_TTL_SECONDS, STAFF_STEAM_LOGIN, type SteamLogin } from './steam-login.js';

/** Os motivos que a tela de entrada do painel (`/entrar?erro=`) sabe explicar. */
export type StaffLoginError = 'cancelado' | 'invalido' | 'indisponivel' | 'sem-acesso' | 'limite';

/** `<painel>/entrar?erro=<motivo>[&voltar=<página de origem>]`. */
export function staffLoginErrorUrl(
  publicStaffUrl: string,
  error: StaffLoginError,
  returnTo: string,
): string {
  const url = new URL('/entrar', publicStaffUrl);
  url.searchParams.set('erro', error);
  if (returnTo !== DEFAULT_RETURN_PATH) url.searchParams.set('voltar', returnTo);
  return url.toString();
}

const OPENID_ERRORS = {
  cancelled: 'cancelado',
  invalid: 'invalido',
  unavailable: 'indisponivel',
} as const;

/**
 * Login Steam do painel da Staff (S25, ADR 0015): o painel é outro host e tem a própria sessão `__Host-` (uma sessão
 * por host), aberta aqui com o realm e o `return_to` de `PUBLIC_STAFF_URL`, que vêm da configuração e nunca do
 * cabeçalho Host. Só quem tem papel de Staff abre sessão: outra Conta volta para `/entrar?erro=sem-acesso`, sem sessão
 * e sem criar Conta (o painel não é porta de entrada de jogador). O Cloudflare Access fica na frente como 2ª trava.
 * Sem `PUBLIC_STAFF_URL`, estas rotas respondem 404.
 */
@ApiTags('auth')
@Controller()
export class StaffAuthController {
  private readonly logger = new Logger(StaffAuthController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STAFF_STEAM_LOGIN) private readonly login: SteamLogin | null,
    @Inject(SessionStore) private readonly sessions: SessionStore,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(StaffRoles) private readonly staffRoles: StaffRoles,
  ) {}

  @Get('auth/steam/staff/login')
  @RateLimit('login')
  @UseFilters(LoginRateLimitFilter)
  @ApiOperation({
    operationId: 'startStaffSteamLogin',
    summary: 'Começa o login Steam do painel da Staff: redireciona para a Steam',
  })
  @ApiQuery({
    name: 'returnTo',
    required: false,
    description: 'Caminho interno do painel para onde voltar depois do login (padrão: /)',
  })
  @ApiFoundResponse({ description: 'Para a Steam (ou para /entrar?erro=indisponivel no painel)' })
  async start(
    @Query('returnTo') returnTo: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const base = this.config.publicStaffUrl;
    if (!base || !this.login) {
      reply.status(HttpStatus.NOT_FOUND).send({ statusCode: 404, message: 'Not Found' });
      return;
    }
    try {
      const { state, redirectUrl } = await this.login.start(returnTo);
      reply.setCookie(LOGIN_STATE_COOKIE, state, {
        path: LOGIN_STATE_PATH,
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: LOGIN_FLOW_TTL_SECONDS,
      });
      reply.redirect(redirectUrl, HttpStatus.FOUND);
    } catch (error) {
      this.logger.error(`Login Steam do painel não começou: ${(error as Error).message}`);
      reply.redirect(
        staffLoginErrorUrl(base, 'indisponivel', DEFAULT_RETURN_PATH),
        HttpStatus.FOUND,
      );
    }
  }

  @Get('auth/steam/staff/callback')
  @RateLimit('login')
  @UseFilters(LoginRateLimitFilter)
  @ApiOperation({
    operationId: 'completeStaffSteamLogin',
    summary:
      'Volta da Steam no painel: verifica a asserção e abre a sessão só para quem tem papel de Staff',
  })
  @ApiResponse({
    status: HttpStatus.SEE_OTHER,
    description: 'Para a página de origem no painel (sessão aberta) ou para /entrar?erro=<motivo>',
  })
  async complete(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const base = this.config.publicStaffUrl;
    if (!base || !this.login) {
      reply.status(HttpStatus.NOT_FOUND).send({ statusCode: 404, message: 'Not Found' });
      return;
    }
    reply.clearCookie(LOGIN_STATE_COOKIE, { path: LOGIN_STATE_PATH });
    const callbackUrl = new URL(request.url, base);
    try {
      const result = await this.login.complete(request.cookies[LOGIN_STATE_COOKIE], callbackUrl);
      if (!result.ok) {
        if (result.reason !== 'cancelled') {
          this.logger.warn(`Login Steam do painel recusado (${result.reason}): ${result.detail}`);
        }
        reply.redirect(
          staffLoginErrorUrl(base, OPENID_ERRORS[result.reason], result.returnTo),
          HttpStatus.SEE_OTHER,
        );
        return;
      }

      // Só Conta que já existe e tem papel de Staff: o painel nunca cria nem reivindica Conta.
      const account = await this.accounts.findBySteamId(result.steamId);
      const role = account ? await this.staffRoles.roleOf(account.id) : null;
      if (!account || !role) {
        this.logger.warn(`Login do painel recusado: ${result.steamId} não tem papel de Staff`);
        reply.redirect(
          staffLoginErrorUrl(base, 'sem-acesso', result.returnTo),
          HttpStatus.SEE_OTHER,
        );
        return;
      }

      // Rotação: a sessão de antes do login (se havia) morre; o id novo nunca foi visto por ninguém.
      const previous = request.cookies[SESSION_COOKIE];
      if (previous) await this.sessions.destroy(previous);
      setSessionCookies(reply, await this.sessions.create(account.id, { firstLogin: false }));
      this.logger.log(`Login do painel de #${account.publicId} (${role})`);
      reply.redirect(`${base}${safeReturnPath(result.returnTo)}`, HttpStatus.SEE_OTHER);
    } catch (error) {
      this.logger.error(`Login Steam do painel falhou: ${(error as Error).message}`);
      reply.redirect(
        staffLoginErrorUrl(base, 'indisponivel', DEFAULT_RETURN_PATH),
        HttpStatus.SEE_OTHER,
      );
    }
  }
}
