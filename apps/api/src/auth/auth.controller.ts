import {
  type CurrentSession as CurrentSessionBody,
  currentSessionSchema,
  DEFAULT_RETURN_PATH,
  LOGIN_ERROR_PATH,
  type LoginError,
} from '@carmine/contracts';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AccountsService } from '../accounts/accounts.service.js';
import { toProfile } from '../accounts/profile.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { AuthenticatedGuard, CurrentSession } from './session.guard.js';
import {
  clearSessionCookies,
  LOGIN_STATE_COOKIE,
  LOGIN_STATE_PATH,
  SESSION_COOKIE,
  setSessionCookies,
} from './session-cookies.js';
import { type Session, SessionStore } from './sessions.js';
import { LOGIN_FLOW_TTL_SECONDS, SteamLogin } from './steam-login.js';
import type { OpenIdFailure } from './steam-openid.js';

const LOGIN_ERRORS: Record<OpenIdFailure['reason'], LoginError> = {
  cancelled: 'cancelado',
  invalid: 'invalido',
  unavailable: 'indisponivel',
};

/**
 * Login Steam (OpenID 2.0), sessão e logout (S03, ADR 0007). As rotas de login são navegações
 * do navegador, então respondem com redirecionamentos, nunca com JSON: o sucesso volta à página
 * de origem e a falha vai para `/entrar?erro=<motivo>`.
 */
@ApiTags('auth')
@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SteamLogin) private readonly login: SteamLogin,
    @Inject(SessionStore) private readonly sessions: SessionStore,
    @Inject(AccountsService) private readonly accounts: AccountsService,
  ) {}

  @Get('auth/steam/login')
  @RateLimit('login')
  @ApiOperation({
    operationId: 'startSteamLogin',
    summary: 'Começa o login Steam: redireciona para a Steam',
  })
  @ApiQuery({
    name: 'returnTo',
    required: false,
    description: 'Caminho interno do web para onde voltar depois do login (padrão: /)',
  })
  @ApiFoundResponse({ description: 'Para a Steam (ou para /entrar?erro=indisponivel)' })
  async start(
    @Query('returnTo') returnTo: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
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
      this.logger.error(`Login Steam não começou: ${(error as Error).message}`);
      reply.redirect(this.errorUrl('indisponivel', DEFAULT_RETURN_PATH), HttpStatus.FOUND);
    }
  }

  @Get('auth/steam/callback')
  @RateLimit('login')
  @ApiOperation({
    operationId: 'completeSteamLogin',
    summary: 'Volta da Steam: verifica a asserção, reivindica a Conta e abre a sessão',
  })
  @ApiResponse({
    status: HttpStatus.SEE_OTHER,
    description: 'Para a página de origem (sessão aberta) ou para /entrar?erro=<motivo>',
  })
  async complete(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    reply.clearCookie(LOGIN_STATE_COOKIE, { path: LOGIN_STATE_PATH });
    const callbackUrl = new URL(request.url, this.config.publicWebUrl);
    try {
      const result = await this.login.complete(request.cookies[LOGIN_STATE_COOKIE], callbackUrl);
      if (!result.ok) {
        if (result.reason !== 'cancelled') {
          this.logger.warn(`Login Steam recusado (${result.reason}): ${result.detail}`);
        }
        reply.redirect(this.errorUrl(LOGIN_ERRORS[result.reason], result.returnTo), 303);
        return;
      }

      const account = await this.accounts.claimOnLogin(result.steamId);
      // Rotação: a sessão de antes do login (se havia) morre; o id novo nunca foi visto por ninguém.
      const previous = request.cookies[SESSION_COOKIE];
      if (previous) {
        await this.sessions.destroy(previous);
      }
      setSessionCookies(reply, await this.sessions.create(account.id));
      this.logger.log(`Login Steam de ${result.steamId} (#${account.publicId})`);
      reply.redirect(`${this.config.publicWebUrl}${result.returnTo}`, HttpStatus.SEE_OTHER);
    } catch (error) {
      this.logger.error(`Login Steam falhou: ${(error as Error).message}`);
      reply.redirect(this.errorUrl('indisponivel', DEFAULT_RETURN_PATH), HttpStatus.SEE_OTHER);
    }
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('mutations')
  @ApiCookieAuth()
  @ApiOperation({
    operationId: 'logout',
    summary: 'Encerra a sessão no servidor e apaga os cookies (exige x-csrf-token)',
  })
  @ApiNoContentResponse({ description: 'Sessão encerrada (ou já não havia sessão)' })
  @ApiForbiddenResponse({ description: 'Token CSRF ausente ou inválido' })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    if (request.carmineSession) {
      await this.sessions.destroy(request.carmineSession.id);
    }
    clearSessionCookies(reply);
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  // Abaixo do AuthenticatedGuard: conta antes dele, inclusive quem não tem sessão.
  @RateLimit('public')
  @ApiCookieAuth()
  @ApiOperation({
    operationId: 'getCurrentSession',
    summary: 'A Conta da sessão atual e o token CSRF das mutações',
  })
  @ApiOkResponse({ description: 'Sessão ativa', standardSchema: currentSessionSchema })
  @ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
  @ApiServiceUnavailableResponse({ description: 'Sessões indisponíveis no momento' })
  async me(
    @CurrentSession() session: Session,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CurrentSessionBody> {
    const account = await this.accounts.findById(session.accountId);
    if (account === null) {
      await this.sessions.destroy(session.id);
      clearSessionCookies(reply);
      throw new UnauthorizedException('Sessão ausente ou expirada; entre de novo');
    }
    return { account: toProfile(account), csrfToken: session.csrfToken };
  }

  private errorUrl(error: LoginError, returnTo: string): string {
    const url = new URL(LOGIN_ERROR_PATH, this.config.publicWebUrl);
    url.searchParams.set('erro', error);
    if (returnTo !== DEFAULT_RETURN_PATH) {
      url.searchParams.set('voltar', returnTo);
    }
    return url.toString();
  }
}
