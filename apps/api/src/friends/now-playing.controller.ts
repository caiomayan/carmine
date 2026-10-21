import { type NowPlaying, nowPlayingSchema } from '@carmine/contracts';
import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccountsService } from '../accounts/accounts.service.js';
import { AuthenticatedGuard, CurrentSession } from '../auth/session.guard.js';
import type { Session } from '../auth/sessions.js';
import { LiveServers } from '../live-servers/live-servers.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';

/** "Jogando agora" do menu da Conta (U1b): em que Servidor Carmine a própria Conta está. */
@ApiTags('friends')
@Controller('me/playing')
export class NowPlayingController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(LiveServers) private readonly live: LiveServers,
  ) {}

  @Get()
  @UseGuards(AuthenticatedGuard)
  // Abaixo do AuthenticatedGuard: conta antes dele, inclusive quem não tem sessão.
  @RateLimit('public')
  @ApiCookieAuth()
  @ApiOperation({
    operationId: 'getNowPlaying',
    summary: 'Servidor Carmine em que a Conta da sessão está jogando agora, se estiver',
  })
  @ApiOkResponse({
    description: 'O servidor (nome, Modo e mapa) ou `server` nulo',
    standardSchema: nowPlayingSchema,
  })
  @ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
  @ApiServiceUnavailableResponse({ description: 'Presença indisponível no momento' })
  async get(@CurrentSession() session: Session): Promise<NowPlaying> {
    const account = await this.accounts.findById(session.accountId);
    if (account === null) {
      throw new UnauthorizedException('Sessão ausente ou expirada; entre de novo');
    }
    try {
      const server = await this.live.serverOf(account.steamId);
      return {
        server: server && {
          id: server.id,
          name: server.name,
          showcaseName: server.showcaseName,
          mode: server.mode,
          map: server.map,
        },
      };
    } catch {
      throw new ServiceUnavailableException('Servidores ao vivo indisponíveis no momento');
    }
  }
}
