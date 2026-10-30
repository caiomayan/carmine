import {
  type AssignInput,
  assignInputSchema,
  type CreatePresetInput,
  createPresetInputSchema,
  type EquipInput,
  equipInputSchema,
  type Loadout,
  type LoadoutChange,
  loadoutChangeSchema,
  loadoutErrorSchema,
  loadoutSchema,
  type Preset,
  type PresetList,
  presetListSchema,
  presetSchema,
  type RenamePresetInput,
  renamePresetInputSchema,
  type UnequipInput,
  unequipInputSchema,
} from '@carmine/contracts';
import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedGuard, CurrentSession } from '../auth/session.guard.js';
import type { Session } from '../auth/sessions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { LoadoutErrorsFilter } from './loadout-errors.filter.js';
import { LoadoutRejection, Loadouts } from './loadouts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Qualquer coisa que não é um id de Preset simplesmente não é um Preset da Conta. */
function presetIdOf(value: string): string {
  if (!UUID.test(value)) throw new LoadoutRejection('preset_not_found', 'Preset não encontrado');
  return value;
}

const errorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: loadoutErrorSchema });

const PRESET_ID_PARAM = { name: 'id', description: 'id do Preset', format: 'uuid' };

const ChangeErrors = () =>
  applyDecorators(
    errorResponse(400, 'Corpo fora do formato (invalid_body)'),
    errorResponse(403, 'Preset somente leitura sem VIP (preset_read_only), ou CSRF inválido'),
    errorResponse(404, 'Item ou Preset não encontrado (item_not_found, preset_not_found)'),
    errorResponse(422, 'Slot ou lado que não existe para o Item (invalid_slot, side_not_allowed)'),
  );

/**
 * O Loadout da Conta da sessão (S05): o Preset ativo, ou outro com `presetId`. Toda rota exige
 * sessão; as mutações também o `x-csrf-token` e contam no rate limit `mutations`. Os erros vêm
 * no formato `LoadoutError`.
 */
@ApiTags('loadout')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
@UseGuards(AuthenticatedGuard)
@UseFilters(LoadoutErrorsFilter)
@Controller('loadout')
export class LoadoutController {
  constructor(@Inject(Loadouts) private readonly loadouts: Loadouts) {}

  @Get()
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getLoadout',
    summary: 'O Loadout (Preset ativo) ou outro Preset, com todos os slots',
  })
  @ApiQuery({ name: 'presetId', required: false, description: 'Ausente = o Preset ativo' })
  @ApiOkResponse({ description: 'O Loadout', standardSchema: loadoutSchema })
  @errorResponse(404, 'Preset não encontrado (preset_not_found)')
  get(
    @CurrentSession() session: Session,
    @Query('presetId') presetId: string | undefined,
  ): Promise<Loadout> {
    return this.loadouts.get(
      session.accountId,
      presetId === undefined ? undefined : presetIdOf(presetId),
    );
  }

  @Post('equip')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'equipItem',
    summary: 'Equipa um Item no slot dele, nos lados pedidos; devolve o que foi substituído',
  })
  @ApiOkResponse({ description: 'O Loadout e o que mudou', standardSchema: loadoutChangeSchema })
  @ChangeErrors()
  equip(
    @CurrentSession() session: Session,
    @Body({ schema: equipInputSchema }) body: EquipInput,
  ): Promise<LoadoutChange> {
    return this.loadouts.equip(session.accountId, body);
  }

  @Post('unequip')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'unequipSlot',
    summary: 'O slot volta à Arma padrão nos lados pedidos',
  })
  @ApiOkResponse({ description: 'O Loadout e o que mudou', standardSchema: loadoutChangeSchema })
  @ChangeErrors()
  unequip(
    @CurrentSession() session: Session,
    @Body({ schema: unequipInputSchema }) body: UnequipInput,
  ): Promise<LoadoutChange> {
    return this.loadouts.unequip(session.accountId, body);
  }

  @Post('assign')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'assignLoadoutSlots',
    summary: 'Define exatamente estes slots (o Desfazer: mande o previous de equip/unequip)',
  })
  @ApiOkResponse({ description: 'O Loadout e o que mudou', standardSchema: loadoutChangeSchema })
  @ChangeErrors()
  assign(
    @CurrentSession() session: Session,
    @Body({ schema: assignInputSchema }) body: AssignInput,
  ): Promise<LoadoutChange> {
    return this.loadouts.assign(session.accountId, body);
  }
}

/**
 * Os Presets da Conta da sessão (S05). O principal sempre existe; com VIP, até
 * o limite do plano (Capo 6, Padrinho 25); o que passa do limite é somente leitura.
 */
@ApiTags('presets')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
@UseGuards(AuthenticatedGuard)
@UseFilters(LoadoutErrorsFilter)
@Controller('presets')
export class PresetsController {
  constructor(@Inject(Loadouts) private readonly loadouts: Loadouts) {}

  @Get()
  @RateLimit('public')
  @ApiOperation({ operationId: 'getPresets', summary: 'Os Presets, o principal primeiro' })
  @ApiOkResponse({ description: 'Os Presets e o limite atual', standardSchema: presetListSchema })
  list(@CurrentSession() session: Session): Promise<PresetList> {
    return this.loadouts.listPresets(session.accountId);
  }

  @Post()
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'createPreset',
    summary: 'Cria um Preset (VIP), cópia do Loadout atual ou vazio; não ativa',
  })
  @ApiCreatedResponse({ description: 'O Preset criado', standardSchema: presetSchema })
  @errorResponse(400, 'Corpo fora do formato (invalid_body)')
  @errorResponse(403, 'Exige um plano (vip_required, nome legado), ou CSRF inválido')
  @errorResponse(409, 'Já há tantos Presets quanto o plano permite (preset_limit)')
  create(
    @CurrentSession() session: Session,
    @Body({ schema: createPresetInputSchema }) body: CreatePresetInput,
  ): Promise<Preset> {
    return this.loadouts.createPreset(session.accountId, {
      name: body.name,
      from: body.from ?? 'current',
    });
  }

  @Patch(':id')
  @RateLimit('mutations')
  @ApiOperation({ operationId: 'renamePreset', summary: 'Renomeia um Preset' })
  @ApiParam(PRESET_ID_PARAM)
  @ApiOkResponse({ description: 'O Preset renomeado', standardSchema: presetSchema })
  @errorResponse(400, 'Corpo fora do formato (invalid_body)')
  @errorResponse(403, 'Preset somente leitura sem VIP (preset_read_only), ou CSRF inválido')
  @errorResponse(404, 'Preset não encontrado (preset_not_found)')
  rename(
    @CurrentSession() session: Session,
    @Param('id') id: string,
    @Body({ schema: renamePresetInputSchema }) body: RenamePresetInput,
  ): Promise<Preset> {
    return this.loadouts.renamePreset(session.accountId, presetIdOf(id), body.name);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'activatePreset',
    summary: 'Ativa o Preset: ele passa a ser o Loadout (no jogo, no próximo connect ou !ws)',
  })
  @ApiParam(PRESET_ID_PARAM)
  @ApiOkResponse({ description: 'Os Presets depois', standardSchema: presetListSchema })
  @errorResponse(403, 'Preset somente leitura sem VIP (preset_read_only), ou CSRF inválido')
  @errorResponse(404, 'Preset não encontrado (preset_not_found)')
  activate(@CurrentSession() session: Session, @Param('id') id: string): Promise<PresetList> {
    return this.loadouts.activatePreset(session.accountId, presetIdOf(id));
  }

  @Delete(':id')
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'deletePreset',
    summary: 'Apaga um Preset extra; se era o ativo, o principal volta a ser o Loadout',
  })
  @ApiParam(PRESET_ID_PARAM)
  @ApiOkResponse({ description: 'Os Presets depois', standardSchema: presetListSchema })
  @errorResponse(403, 'Preset somente leitura sem VIP (preset_read_only), ou CSRF inválido')
  @errorResponse(404, 'Preset não encontrado (preset_not_found)')
  @errorResponse(409, 'O Preset principal não é apagado (preset_main)')
  remove(@CurrentSession() session: Session, @Param('id') id: string): Promise<PresetList> {
    return this.loadouts.deletePreset(session.accountId, presetIdOf(id));
  }
}
