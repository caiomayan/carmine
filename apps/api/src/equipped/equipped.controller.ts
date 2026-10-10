import { type EquippedV5, equippedV5Schema, steamId64Schema } from '@carmine/contracts';
import { Controller, Get, Param } from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

/**
 * Loadout no formato `equipped/v5`, lido pelo cs2-css-inventory-simulator sem modificação
 * (ADR 0006). Público porque o plugin não manda credencial; limitado por IP (o limite vem de
 * EQUIPPED_RATE_LIMIT_PER_MINUTE, nas opções do rate limit em `app.ts`).
 */
@ApiTags('equipped')
@Controller('equipped/v5')
export class EquippedController {
  @Get(':steamId.json')
  @RouteConfig({ rateLimit: {} })
  @ApiOperation({
    operationId: 'getEquippedV5',
    summary: 'Loadout equipado da Conta no formato do cs2-css-inventory-simulator',
  })
  @ApiOkResponse({
    description: 'Itens equipados; slot ausente usa a Arma padrão',
    standardSchema: equippedV5Schema,
  })
  @ApiBadRequestResponse({ description: 'SteamID64 inválido' })
  @ApiTooManyRequestsResponse({ description: 'Limite de requisições por IP excedido' })
  getEquipped(@Param('steamId', { schema: steamId64Schema }) _steamId: string): EquippedV5 {
    // Ainda não há Inventário (S04) nem Loadout (S05): toda Conta joga com as Armas padrão.
    return { agents: {}, ctWeapons: {}, gloves: {}, knives: {}, tWeapons: {} };
  }
}
