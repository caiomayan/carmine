import { type FriendsPlaying, friendsPlayingSchema } from '@carmine/contracts';
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
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { FriendsPlayingFinder } from './friends-playing.js';

/** "Seus amigos jogando agora" na home (S06), para a Conta da sessão. */
@ApiTags('friends')
@Controller('me/friends-playing')
export class FriendsPlayingController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(FriendsPlayingFinder) private readonly finder: FriendsPlayingFinder,
  ) {}

  @Get()
  @UseGuards(AuthenticatedGuard)
  // Abaixo do AuthenticatedGuard: conta antes dele, inclusive quem não tem sessão.
  @RateLimit('public')
  @ApiCookieAuth()
  @ApiOperation({
    operationId: 'getFriendsPlaying',
    summary: 'Amigos Steam da Conta jogando agora num Servidor Carmine',
  })
  @ApiOkResponse({
    description: 'Amigos jogando (ok), lista de amigos privada ou Steam indisponível',
    standardSchema: friendsPlayingSchema,
  })
  @ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
  @ApiServiceUnavailableResponse({ description: 'Presença indisponível no momento' })
  async get(@CurrentSession() session: Session): Promise<FriendsPlaying> {
    const account = await this.accounts.findById(session.accountId);
    if (account === null) {
      throw new UnauthorizedException('Sessão ausente ou expirada; entre de novo');
    }
    try {
      return await this.finder.of(account.steamId);
    } catch {
      throw new ServiceUnavailableException('Servidores ao vivo indisponíveis no momento');
    }
  }
}
