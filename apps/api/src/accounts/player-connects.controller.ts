import {
  type PlayerConnect,
  type PlayerConnectResult,
  playerConnectResultSchema,
  playerConnectSchema,
  vipNoticeAt,
} from '@carmine/contracts';
import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Analytics } from '../analytics/analytics.js';
import type { GameServer } from '../game-servers/game-server-registry.js';
import { CurrentGameServer, ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { Loadouts } from '../loadout/loadouts.js';
import { Sanctions } from '../moderation/sanctions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { Greetings } from '../stats/greeting.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { toVipStatus } from '../vip/vip-status.js';
import { AccountsService } from './accounts.service.js';

@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/player-connects')
export class PlayerConnectsController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(Sanctions) private readonly sanctions: Sanctions,
    @Inject(VipPeriods) private readonly vip: VipPeriods,
    @Inject(Analytics) private readonly analytics: Analytics,
    @Inject(Loadouts) private readonly loadouts: Loadouts,
    @Inject(Greetings) private readonly greetings: Greetings,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'registerPlayerConnect',
    summary: 'Registra o connect de um jogador; cria a Conta no primeiro connect',
  })
  @ApiOkResponse({
    description: 'Nome de exibição, ID público, VIP e Punições a aplicar no jogo',
    standardSchema: playerConnectResultSchema,
  })
  @ApiBadRequestResponse({ description: 'Corpo inválido' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async register(
    @Body({ schema: playerConnectSchema }) connect: PlayerConnect,
    @CurrentGameServer() server: GameServer,
  ): Promise<PlayerConnectResult> {
    const { accountId, created, claimed, connectedAt, ...account } =
      await this.accounts.registerConnect(connect);
    const [vip, sanctions, greeting] = await Promise.all([
      this.vip.planStatusOf(accountId),
      this.sanctions.forGame([connect.steamId]),
      this.greetings.forConnect(
        accountId,
        account.displayName,
        server.mode,
        account.isFirstConnect,
      ),
    ]);
    void this.measure(server, { accountId, created, claimed, connectedAt }, account, vip.active);
    return {
      ...account,
      isVip: vip.active,
      plan: vip.plan,
      vipNotice: vipNoticeAt(toVipStatus(vip), new Date()),
      vipEndsAt: vip.endsAt?.toISOString() ?? null,
      sanctions,
      greeting,
    };
  }

  /**
   * `conta_criada` (origem jogo) e `servidor_conectado` (A1, plano de eventos), com o horário do connect do plugin
   * (não o do reenvio). Sem esperar: a resposta ao jogo não depende do analytics. Conta anonimizada não emite.
   */
  private async measure(
    server: GameServer,
    connect: { accountId: string; created: boolean; claimed: boolean; connectedAt: Date },
    account: { isFirstConnect: boolean },
    isVip: boolean,
  ): Promise<void> {
    if (!this.analytics.enabled) return;
    try {
      const { accountId, created, claimed, connectedAt } = connect;
      if (created) {
        this.analytics.capture('conta_criada', {
          accountId,
          props: { origem: 'jogo', modo: server.mode },
          at: connectedAt,
          naturalId: accountId,
        });
      }
      this.analytics.capture('servidor_conectado', {
        accountId,
        props: {
          modo: server.mode,
          servidor_codigo: server.code,
          primeiro_connect: account.isFirstConnect,
          eh_vip: isVip,
          conta_reivindicada: claimed,
          itens_equipados: await this.loadouts.equippedSlotCount(accountId),
          // O plugin reenviou um connect que ficou na fila com a API fora.
          reenvio: Date.now() - connectedAt.getTime() > 60_000,
        },
        at: connectedAt,
      });
    } catch {
      // Analytics nunca derruba o connect.
    }
  }
}
