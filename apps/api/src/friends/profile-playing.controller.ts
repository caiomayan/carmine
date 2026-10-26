import { type ProfilePlaying, profilePlayingSchema } from '@carmine/contracts';
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccountsService } from '../accounts/accounts.service.js';
import { LiveServers } from '../live-servers/live-servers.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';

/** Mesma regra do Perfil: só dígitos, sem zero à esquerda. */
const PUBLIC_ID = /^[1-9]\d{0,14}$/;

/** "Jogando agora" no Perfil de qualquer Conta, com o endereço para o "Entrar junto". */
@ApiTags('profiles')
@Controller('profiles')
export class ProfilePlayingController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(LiveServers) private readonly live: LiveServers,
  ) {}

  @Get(':publicId/playing')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getProfilePlaying',
    summary:
      'Servidor Carmine em que uma Conta está jogando agora, se estiver; público, inclusive no Perfil privado',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({
    description: 'O servidor (com endereço e estado) ou `server` nulo',
    standardSchema: profilePlayingSchema,
  })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse ID público (ou ela foi excluída)' })
  @ApiServiceUnavailableResponse({ description: 'Presença indisponível no momento' })
  async get(@Param('publicId') publicId: string): Promise<ProfilePlaying> {
    const account = PUBLIC_ID.test(publicId)
      ? await this.accounts.findByPublicId(Number(publicId))
      : null;
    if (account === null || account.anonymizedAt !== null) {
      throw new NotFoundException('Perfil não encontrado');
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
          address: server.address,
          state: server.state,
        },
      };
    } catch {
      throw new ServiceUnavailableException('Servidores ao vivo indisponíveis no momento');
    }
  }
}
