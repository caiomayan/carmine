import { type EquippedV5, equippedV5Schema, steamId64Schema } from '@carmine/contracts';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';

/**
 * Loadout no formato `equipped/v5`, lido pelo cs2-css-inventory-simulator sem modificação
 * (ADR 0006). Público porque o plugin não manda credencial; limitado por IP (política
 * `equipped`, RATE_LIMIT_EQUIPPED_PER_MINUTE).
 */
@ApiTags('equipped')
@Controller('equipped/v5')
export class EquippedController {
  @Get(':steamId.json')
  @RateLimit('equipped')
  @ApiOperation({
    operationId: 'getEquippedV5',
    summary: 'Loadout equipado da Conta no formato do cs2-css-inventory-simulator',
  })
  @ApiOkResponse({
    description: 'Itens equipados; slot ausente usa a Arma padrão',
    standardSchema: equippedV5Schema,
  })
  @ApiBadRequestResponse({ description: 'SteamID64 inválido' })
  getEquipped(@Param('steamId', { schema: steamId64Schema }) _steamId: string): EquippedV5 {
    // Ainda não há Inventário (S04) nem Loadout (S05): toda Conta joga com as Armas padrão.
    return { agents: {}, ctWeapons: {}, gloves: {}, knives: {}, tWeapons: {} };
  }
}
