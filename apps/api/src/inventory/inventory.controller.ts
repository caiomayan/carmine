import {
  INVENTORY_MAX_ITEMS,
  type Inventory as InventoryBody,
  type InventoryItem,
  type InventoryItemInput,
  type ItemUsages,
  inventoryErrorSchema,
  inventoryItemInputSchema,
  inventoryItemSchema,
  inventorySchema,
  itemUsagesSchema,
  type RemovedInventoryItem,
  removedInventoryItemSchema,
} from '@carmine/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedGuard, CurrentSession } from '../auth/session.guard.js';
import type { Session } from '../auth/sessions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { Inventory, InventoryRejection } from './inventory.js';
import { InventoryErrorsFilter } from './inventory-errors.filter.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Qualquer coisa que não é um uid simplesmente não está no Inventário. */
function uidOf(value: string): string {
  if (!UUID.test(value)) {
    throw new InventoryRejection({
      code: 'not_found',
      message: 'Item não encontrado no Inventário',
    });
  }
  return value;
}

const UID_PARAM = { name: 'uid', description: 'uid do Item no Inventário', format: 'uuid' };

const errorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: inventoryErrorSchema });

/**
 * O Inventário da Conta da sessão (S04). Toda rota exige sessão; as mutações também o
 * `x-csrf-token` (SessionGuard) e contam no rate limit `mutations`. Os erros vêm no formato
 * `InventoryError`, com código estável.
 */
@ApiTags('inventory')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
@UseGuards(AuthenticatedGuard)
@UseFilters(InventoryErrorsFilter)
@Controller('inventory')
export class InventoryController {
  constructor(@Inject(Inventory) private readonly inventory: Inventory) {}

  @Get()
  @RateLimit('public')
  @ApiOperation({ operationId: 'getInventory', summary: 'Os Itens do Inventário, do mais novo' })
  @ApiOkResponse({ description: 'O Inventário', standardSchema: inventorySchema })
  async list(@CurrentSession() session: Session): Promise<InventoryBody> {
    return { items: await this.inventory.list(session.accountId), limit: INVENTORY_MAX_ITEMS };
  }

  @Post('items')
  @RateLimit('mutations')
  @ApiOperation({ operationId: 'addInventoryItem', summary: 'Adiciona um Item ao Inventário' })
  @ApiCreatedResponse({ description: 'O Item adicionado', standardSchema: inventoryItemSchema })
  @errorResponse(400, 'Corpo fora do formato (invalid_body)')
  @errorResponse(403, 'Exige VIP (vip_required), ou token CSRF ausente ou inválido')
  @errorResponse(409, `Inventário cheio: ${INVENTORY_MAX_ITEMS} Itens (inventory_full)`)
  @errorResponse(422, 'O Item quebra uma regra do jogo (código no corpo)')
  add(
    @CurrentSession() session: Session,
    @Body({ schema: inventoryItemInputSchema }) body: InventoryItemInput,
  ): Promise<InventoryItem> {
    return this.inventory.add(session.accountId, body.item);
  }

  @Put('items/:uid')
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'replaceInventoryItem',
    summary: 'Edita um Item: substitui todos os atributos (o id do catálogo não muda)',
  })
  @ApiParam(UID_PARAM)
  @ApiOkResponse({ description: 'O Item editado', standardSchema: inventoryItemSchema })
  @errorResponse(400, 'Corpo fora do formato (invalid_body)')
  @errorResponse(403, 'Exige VIP (vip_required), ou token CSRF ausente ou inválido')
  @errorResponse(404, 'Item não encontrado (not_found)')
  @errorResponse(422, 'O Item quebra uma regra do jogo, ou mudou de id (código no corpo)')
  replace(
    @CurrentSession() session: Session,
    @Param('uid') uid: string,
    @Body({ schema: inventoryItemInputSchema }) body: InventoryItemInput,
  ): Promise<InventoryItem> {
    return this.inventory.replace(session.accountId, uidOf(uid), body.item);
  }

  @Get('items/:uid/usages')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getInventoryItemUsages',
    summary: 'Onde o Item está em uso (Loadout e Presets), para confirmar a remoção',
  })
  @ApiParam(UID_PARAM)
  @ApiOkResponse({ description: 'Os usos do Item', standardSchema: itemUsagesSchema })
  @errorResponse(404, 'Item não encontrado (not_found)')
  usages(@CurrentSession() session: Session, @Param('uid') uid: string): Promise<ItemUsages> {
    return this.inventory.usages(session.accountId, uidOf(uid));
  }

  @Delete('items/:uid')
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'removeInventoryItem',
    summary: 'Remove um Item; até restorableUntil, POST .../restore o devolve',
  })
  @ApiParam(UID_PARAM)
  @ApiOkResponse({
    description: 'Onde o Item estava em uso e até quando dá para desfazer',
    standardSchema: removedInventoryItemSchema,
  })
  @ApiForbiddenResponse({ description: 'Token CSRF ausente ou inválido' })
  @errorResponse(404, 'Item não encontrado (not_found)')
  remove(
    @CurrentSession() session: Session,
    @Param('uid') uid: string,
  ): Promise<RemovedInventoryItem> {
    return this.inventory.remove(session.accountId, uidOf(uid));
  }

  @Post('items/:uid/restore')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'restoreInventoryItem',
    summary: 'Desfaz a remoção: o Item volta com o mesmo uid',
  })
  @ApiParam(UID_PARAM)
  @ApiOkResponse({ description: 'O Item restaurado', standardSchema: inventoryItemSchema })
  @ApiForbiddenResponse({ description: 'Token CSRF ausente ou inválido' })
  @errorResponse(404, 'Item não encontrado (not_found)')
  @errorResponse(409, `Inventário cheio: ${INVENTORY_MAX_ITEMS} Itens (inventory_full)`)
  @errorResponse(410, 'O prazo para desfazer acabou (restore_expired)')
  restore(@CurrentSession() session: Session, @Param('uid') uid: string): Promise<InventoryItem> {
    return this.inventory.restore(session.accountId, uidOf(uid));
  }
}
