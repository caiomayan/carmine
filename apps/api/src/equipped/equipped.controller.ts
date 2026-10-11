import { equippedV5Schema, steamId64Schema } from '@carmine/contracts';
import { Controller, Get, Header, Inject, Param } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { Equipped } from './equipped.js';

/**
 * Loadout no formato `equipped/v5`, lido pelo cs2-css-inventory-simulator sem modificação
 * (ADR 0006). Público porque o plugin não manda credencial; limitado por IP (política
 * `equipped`, RATE_LIMIT_EQUIPPED_PER_MINUTE). Servido do cache no Valkey, invalidado a cada
 * mudança no Loadout, num Item equipado ou no VIP.
 */
@ApiTags('equipped')
@Controller('equipped/v5')
export class EquippedController {
  constructor(@Inject(Equipped) private readonly equipped: Equipped) {}

  @Get(':steamId.json')
  @RateLimit('equipped')
  @Header('content-type', 'application/json; charset=utf-8')
  @ApiOperation({
    operationId: 'getEquippedV5',
    summary: 'Loadout equipado da Conta no formato do cs2-css-inventory-simulator',
  })
  @ApiOkResponse({
    description:
      'Itens equipados do Preset ativo; slot ausente usa a Arma padrão. Sem Período VIP ativo, agentes e music kits ficam fora e o StatTrak e a nametag saem dos Itens',
    standardSchema: equippedV5Schema,
  })
  @ApiBadRequestResponse({ description: 'SteamID64 inválido' })
  getEquipped(@Param('steamId', { schema: steamId64Schema }) steamId: string): Promise<string> {
    return this.equipped.bodyOf(steamId);
  }
}
