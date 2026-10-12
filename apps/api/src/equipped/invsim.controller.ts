import { type InvsimItemRequest, invsimItemRequestSchema } from '@carmine/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { InvsimKeyGuard } from '../game-servers/server-key.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { StatTrakCounter } from './stattrak-counter.js';

/**
 * Rotas que o cs2-css-inventory-simulator chama além do `equipped/v5`, no formato dele (ADR
 * 0006): só Servidores Carmine, pela chave em `apiKey` (o `invsim_apikey`) ou no cabeçalho
 * `Authorization: Bearer`. Contam no rate limit `server` do Servidor Carmine.
 */
@ApiTags('server')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
@UseGuards(InvsimKeyGuard)
@Controller()
export class InvsimController {
  constructor(@Inject(StatTrakCounter) private readonly counter: StatTrakCounter) {}

  @Post('increment-item-stattrak')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'incrementItemStatTrak',
    summary: 'Um abate com o Item: soma 1 ao StatTrak (Item do Loadout, Conta com VIP)',
  })
  @ApiNoContentResponse({
    description:
      'Contado; ou ignorado em silêncio (Item sem StatTrak, Conta sem VIP ou Item fora do Loadout)',
  })
  @ApiBadRequestResponse({
    description: 'Corpo inválido, ou nenhum Item com esse uid no Inventário dessa Conta',
  })
  async incrementStatTrak(
    @Body({ schema: invsimItemRequestSchema }) body: InvsimItemRequest,
  ): Promise<void> {
    if ((await this.counter.increment(body.userId, body.targetUid)) === 'unknown') {
      throw new BadRequestException('Nenhum Item com esse uid no Inventário dessa Conta');
    }
  }

  /**
   * Grafites não são Itens na Carmine (o `equipped/v5` nunca manda `graffiti` e o servidor
   * roda com `invsim_spray_enabled 0`), então não há carga a consumir. Responde 204 para o
   * plugin não registrar erro se o spray for ligado por engano.
   */
  @Post('consume-item-spray')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'consumeItemSpray',
    summary: 'Não faz nada: grafites não são Itens na Carmine',
  })
  @ApiNoContentResponse({ description: 'Nada a consumir' })
  @ApiBadRequestResponse({ description: 'Corpo inválido' })
  consumeSpray(@Body({ schema: invsimItemRequestSchema }) _body: InvsimItemRequest): void {}
}
