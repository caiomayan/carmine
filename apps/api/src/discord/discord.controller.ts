import {
  DISCORD_RESULT_PARAM,
  type DiscordLinkResult,
  type DiscordLinkStatus,
  discordLinkStatusSchema,
  safeReturnPath,
} from '@carmine/contracts';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
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
import { LoginRateLimitFilter } from '../auth/login-errors.js';
import { AuthenticatedGuard, CurrentSession } from '../auth/session.guard.js';
import type { Session } from '../auth/sessions.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { DISCORD, type DiscordIntegration } from './discord-integration.js';
import { DISCORD_FLOW_TTL_SECONDS } from './discord-link-flow.js';
import { DiscordLinks } from './discord-links.js';

/** Cookie do fluxo: o `state` que amarra a volta do Discord a este navegador. */
export const DISCORD_STATE_COOKIE = 'carmine_discord';
export const DISCORD_STATE_PATH = '/api/auth/discord';

/**
 * Vínculo da Conta com o Discord (S15). É só um vínculo, não um login (ADR 0007): as rotas de
 * navegação exigem a sessão Steam e voltam à página de origem com `?discord=<resultado>`.
 */
@ApiTags('discord')
@Controller()
export class DiscordController {
  private readonly logger = new Logger(DiscordController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DISCORD) private readonly discord: DiscordIntegration | null,
    @Inject(DiscordLinks) private readonly links: DiscordLinks,
  ) {}

  @Get('auth/discord/link')
  @RateLimit('login')
  @UseFilters(LoginRateLimitFilter)
  @ApiCookieAuth()
  @ApiOperation({
    operationId: 'startDiscordLink',
    summary:
      'Começa o vínculo do Discord: redireciona para a autorização do Discord (exige sessão)',
  })
  @ApiQuery({
    name: 'returnTo',
    required: false,
    description: 'Caminho interno do web para onde voltar (padrão: /)',
  })
  @ApiFoundResponse({ description: 'Para o Discord, ou de volta com ?discord=<motivo>' })
  async start(
    @Req() request: FastifyRequest,
    @Query('returnTo') returnTo: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const back = safeReturnPath(returnTo);
    const session = request.carmineSession;
    if (!session) {
      reply.redirect(this.signInUrl(back), HttpStatus.FOUND);
      return;
    }
    if (!this.discord) {
      reply.redirect(this.backUrl(back, 'desligado'), HttpStatus.FOUND);
      return;
    }
    try {
      const { state, redirectUrl } = await this.discord.flow.start(session.accountId, back);
      reply.setCookie(DISCORD_STATE_COOKIE, state, {
        path: DISCORD_STATE_PATH,
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: DISCORD_FLOW_TTL_SECONDS,
      });
      reply.redirect(redirectUrl, HttpStatus.FOUND);
    } catch (error) {
      this.logger.error(`Vínculo do Discord não começou: ${(error as Error).message}`);
      reply.redirect(this.backUrl(back, 'indisponivel'), HttpStatus.FOUND);
    }
  }

  @Get('auth/discord/callback')
  @RateLimit('login')
  @UseFilters(LoginRateLimitFilter)
  @ApiCookieAuth()
  @ApiOperation({
    operationId: 'completeDiscordLink',
    summary: 'Volta do Discord: liga o Discord à Conta da sessão e aplica os cargos',
  })
  @ApiResponse({
    status: HttpStatus.SEE_OTHER,
    description: 'Para a página de origem com ?discord=<resultado>',
  })
  async complete(
    @Req() request: FastifyRequest,
    @Query() query: { code?: string; state?: string; error?: string },
    @Res() reply: FastifyReply,
  ): Promise<void> {
    reply.clearCookie(DISCORD_STATE_COOKIE, { path: DISCORD_STATE_PATH });
    const session = request.carmineSession;
    if (!session) {
      reply.redirect(this.signInUrl('/'), HttpStatus.SEE_OTHER);
      return;
    }
    if (!this.discord) {
      reply.redirect(this.backUrl('/', 'desligado'), HttpStatus.SEE_OTHER);
      return;
    }
    try {
      const { result, returnTo } = await this.discord.flow.complete(
        session.accountId,
        request.cookies[DISCORD_STATE_COOKIE],
        { code: str(query.code), state: str(query.state), error: str(query.error) },
      );
      reply.redirect(this.backUrl(returnTo, result), HttpStatus.SEE_OTHER);
    } catch (error) {
      this.logger.error(`Vínculo do Discord falhou: ${(error as Error).message}`);
      reply.redirect(this.backUrl('/', 'indisponivel'), HttpStatus.SEE_OTHER);
    }
  }

  @Get('discord/link')
  @UseGuards(AuthenticatedGuard)
  @RateLimit('public')
  @ApiCookieAuth()
  @ApiOperation({
    operationId: 'getDiscordLink',
    summary: 'O Discord ligado à Conta da sessão, e se a integração está ligada neste ambiente',
  })
  @ApiOkResponse({ description: 'Estado do vínculo', standardSchema: discordLinkStatusSchema })
  @ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
  async status(@CurrentSession() session: Session): Promise<DiscordLinkStatus> {
    const link = await this.links.of(session.accountId);
    return {
      enabled: this.discord !== null,
      link: link ? { username: link.username, linkedAt: link.linkedAt.toISOString() } : null,
    };
  }

  @Delete('discord/link')
  @UseGuards(AuthenticatedGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('mutations')
  @ApiCookieAuth()
  @ApiOperation({
    operationId: 'unlinkDiscord',
    summary: 'Desvincula o Discord e tira os cargos dele (exige x-csrf-token)',
  })
  @ApiNoContentResponse({ description: 'Desvinculado (ou já não estava vinculado)' })
  @ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
  @ApiServiceUnavailableResponse({ description: 'O Discord não respondeu; o vínculo continua' })
  async unlink(@CurrentSession() session: Session): Promise<void> {
    if (!this.discord) {
      // Integração desligada: não há como falar com o Discord, então só desfaz o vínculo.
      await this.links.remove(session.accountId);
      return;
    }
    try {
      await this.discord.roles.unlink(session.accountId);
    } catch (error) {
      this.logger.warn(`Desvínculo do Discord falhou: ${(error as Error).message}`);
      throw new ServiceUnavailableException('O Discord não respondeu; tente de novo');
    }
  }

  private backUrl(returnTo: string, result: DiscordLinkResult): string {
    const url = new URL(returnTo, this.config.publicWebUrl);
    url.searchParams.set(DISCORD_RESULT_PARAM, result);
    return url.toString();
  }

  private signInUrl(returnTo: string): string {
    const url = new URL('/entrar', this.config.publicWebUrl);
    if (returnTo !== '/') url.searchParams.set('voltar', returnTo);
    return url.toString();
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
