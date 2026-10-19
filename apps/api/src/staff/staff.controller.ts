import {
  type AccountAnonymized,
  type ApplySanctions,
  accountAnonymizedSchema,
  applySanctionsSchema,
  type RemoveRankingEntry,
  type RevokeSanction,
  removeRankingEntrySchema,
  reportStatusSchema,
  revokeSanctionSchema,
  type SetStaffRole,
  STAFF_AUDIT_PAGE_DEFAULT,
  STAFF_AUDIT_PAGE_MAX,
  STAFF_REPORTS_PAGE_DEFAULT,
  STAFF_REPORTS_PAGE_MAX,
  type StaffAccountDetail,
  type StaffAccountSearch,
  type StaffAuditPage,
  type StaffReasonBody,
  type StaffReportPage,
  type StaffServer,
  type StaffVipGrant,
  setStaffRoleSchema,
  staffAccountDetailSchema,
  staffAccountSearchSchema,
  staffAuditActionSchema,
  staffAuditPageSchema,
  staffErrorSchema,
  staffMemberListSchema,
  staffReasonBodySchema,
  staffReportPageSchema,
  staffServerListSchema,
  staffServerSchema,
  staffVipGrantSchema,
  steamId64Schema,
  type UpdateStaffServer,
  updateStaffServerSchema,
} from '@carmine/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { AuthenticatedGuard } from '../auth/session.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { CurrentStaff, type StaffActor, StaffOnly } from './staff.guard.js';
import { StaffErrorsFilter, StaffRejection } from './staff-errors.js';
import { StaffPanel } from './staff-panel.js';

/** ID público no caminho: só dígitos, sem zero à esquerda. */
const publicIdParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, 'ID público inválido')
  .transform(Number);

const uuidParam = z.uuid('id inválido');

const auditQuerySchema = z.object({
  actor: steamId64Schema.optional(),
  target: steamId64Schema.optional(),
  action: staffAuditActionSchema.optional(),
  before: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(STAFF_AUDIT_PAGE_MAX).default(STAFF_AUDIT_PAGE_DEFAULT),
});

const reportsQuerySchema = z.object({
  status: reportStatusSchema.default('open'),
  before: z.string().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(STAFF_REPORTS_PAGE_MAX)
    .default(STAFF_REPORTS_PAGE_DEFAULT),
});

const ERROR = {
  description: 'Recusa com código estável (`StaffError`)',
  standardSchema: staffErrorSchema,
};

/**
 * Painel da Staff (S07): busca e detalhe de Conta, Punições, VIP, Nome de exibição, papéis,
 * Servidores Carmine e o log de auditoria. Toda rota exige sessão e um papel com a permissão
 * (`STAFF_PERMISSIONS`); as mutações exigem `x-csrf-token` e um motivo, que vai para o log.
 */
@ApiTags('staff')
@UseGuards(AuthenticatedGuard)
@UseFilters(StaffErrorsFilter)
@Controller('staff')
export class StaffController {
  constructor(@Inject(StaffPanel) private readonly panel: StaffPanel) {}

  @Get('accounts')
  @StaffOnly('accounts.read')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'searchStaffAccounts',
    summary: 'Busca Conta por ID público, SteamID64 (ou link Steam) ou parte do nome',
  })
  @ApiQuery({ name: 'q', required: true, description: 'O que buscar (mínimo 2 caracteres)' })
  @ApiOkResponse({ description: 'Até 20 Contas', standardSchema: staffAccountSearchSchema })
  search(@Query('q') q: string | undefined): Promise<StaffAccountSearch> {
    return this.panel.search(q ?? '');
  }

  @Get('accounts/:publicId')
  @StaffOnly('accounts.read')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getStaffAccount',
    summary: 'Conta com VIP, histórico de Punições, sugestões da tabela e ações da Staff',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'O detalhe', standardSchema: staffAccountDetailSchema })
  @ApiNotFoundResponse(ERROR)
  detail(
    @Param('publicId', { schema: publicIdParam }) publicId: number,
  ): Promise<StaffAccountDetail> {
    return this.panel.detail(publicId);
  }

  @Post('accounts/:publicId/sanctions')
  @StaffOnly('sanctions.apply')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'applySanctions',
    summary: 'Aplica uma ocorrência (1 ou 2 medidas); ban derruba as sessões do site',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiCreatedResponse({ description: 'Aplicada', standardSchema: staffAccountDetailSchema })
  @ApiBadRequestResponse(ERROR)
  @ApiNotFoundResponse(ERROR)
  apply(
    @CurrentStaff() actor: StaffActor,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: applySanctionsSchema }) body: ApplySanctions,
  ): Promise<StaffAccountDetail> {
    return this.panel.applySanctions(actor, publicId, body);
  }

  @Post('sanctions/:id/revoke')
  @StaffOnly('sanctions.apply')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'revokeSanction',
    summary: 'Revoga uma Punição; recurso aceito a tira do Perfil e da reincidência',
  })
  @ApiOkResponse({ description: 'Revogada', standardSchema: staffAccountDetailSchema })
  @ApiNotFoundResponse(ERROR)
  @ApiConflictResponse(ERROR)
  revoke(
    @CurrentStaff() actor: StaffActor,
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: revokeSanctionSchema }) body: RevokeSanction,
  ): Promise<StaffAccountDetail> {
    return this.panel.revokeSanction(actor, id, body);
  }

  @Post('accounts/:publicId/vip/grant')
  @StaffOnly('vip.manage')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'staffGrantVip', summary: 'Concede dias de VIP (somam ao ativo)' })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'Concedido', standardSchema: staffAccountDetailSchema })
  grantVip(
    @CurrentStaff() actor: StaffActor,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: staffVipGrantSchema }) body: StaffVipGrant,
  ): Promise<StaffAccountDetail> {
    return this.panel.grantVip(actor, publicId, body);
  }

  @Post('accounts/:publicId/vip/revoke')
  @StaffOnly('vip.manage')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'staffRevokeVip', summary: 'Encerra o VIP agora' })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'Revogado', standardSchema: staffAccountDetailSchema })
  @ApiConflictResponse(ERROR)
  revokeVip(
    @CurrentStaff() actor: StaffActor,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: staffReasonBodySchema }) body: StaffReasonBody,
  ): Promise<StaffAccountDetail> {
    return this.panel.revokeVip(actor, publicId, body.reason);
  }

  @Post('accounts/:publicId/anonymize')
  @StaffOnly('accounts.anonymize')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'staffAnonymizeAccount',
    summary:
      'Executa um pedido de exclusão de dados (S08): anonimiza a Conta, sem volta (só o Dono)',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'Anonimizada', standardSchema: accountAnonymizedSchema })
  @ApiConflictResponse(ERROR)
  anonymize(
    @CurrentStaff() actor: StaffActor,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: staffReasonBodySchema }) body: StaffReasonBody,
  ): Promise<AccountAnonymized> {
    return this.panel.anonymize(actor, publicId, body.reason);
  }

  @Post('accounts/:publicId/display-name/reset')
  @StaffOnly('displayName.reset')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'resetDisplayName',
    summary: 'Troca o Nome de exibição por "Jogador #ID" enquanto o nome Steam não mudar',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'Resetado', standardSchema: staffAccountDetailSchema })
  resetDisplayName(
    @CurrentStaff() actor: StaffActor,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: staffReasonBodySchema }) body: StaffReasonBody,
  ): Promise<StaffAccountDetail> {
    return this.panel.resetDisplayName(actor, publicId, body.reason);
  }

  @Post('accounts/:publicId/ranking-removals')
  @StaffOnly('ranking.remove')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'removeRankingEntry',
    summary:
      'Tira a Conta do Ranking de um Modo e semana (S12), com motivo; as Estatísticas continuam',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'Removida', standardSchema: staffAccountDetailSchema })
  @ApiNotFoundResponse(ERROR)
  @ApiConflictResponse(ERROR)
  removeRankingEntry(
    @CurrentStaff() actor: StaffActor,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: removeRankingEntrySchema }) body: RemoveRankingEntry,
  ): Promise<StaffAccountDetail> {
    return this.panel.removeFromRanking(actor, publicId, body);
  }

  @Put('accounts/:publicId/role')
  @StaffOnly('roles.manage')
  @RateLimit('mutations')
  @ApiOperation({ operationId: 'setStaffRole', summary: 'Dá ou tira o papel de Staff (só o Dono)' })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'Papel alterado', standardSchema: staffAccountDetailSchema })
  @ApiConflictResponse(ERROR)
  setRole(
    @CurrentStaff() actor: StaffActor,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: setStaffRoleSchema }) body: SetStaffRole,
  ): Promise<StaffAccountDetail> {
    return this.panel.setRole(actor, publicId, body);
  }

  @Get('members')
  @StaffOnly('accounts.read')
  @RateLimit('public')
  @ApiOperation({ operationId: 'listStaffMembers', summary: 'A Staff e o papel de cada um' })
  @ApiOkResponse({ description: 'A Staff', standardSchema: staffMemberListSchema })
  async members() {
    return { members: await this.panel.members() };
  }

  @Get('servers')
  @StaffOnly('servers.edit')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'listStaffServers',
    summary: 'Servidores Carmine com nome de vitrine, código e hostname',
  })
  @ApiOkResponse({ description: 'Os servidores', standardSchema: staffServerListSchema })
  async servers() {
    return { servers: await this.panel.servers() };
  }

  @Patch('servers/:id')
  @StaffOnly('servers.edit')
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'updateStaffServer',
    summary: 'Muda nome de vitrine e código; o hostname muda no próximo batimento',
  })
  @ApiOkResponse({ description: 'Atualizado', standardSchema: staffServerSchema })
  @ApiNotFoundResponse(ERROR)
  @ApiConflictResponse(ERROR)
  updateServer(
    @CurrentStaff() actor: StaffActor,
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateStaffServerSchema }) body: UpdateStaffServer,
  ): Promise<StaffServer> {
    return this.panel.updateServer(actor, id, body);
  }

  @Get('reports')
  @StaffOnly('reports.handle')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'listStaffReports',
    summary:
      'Fila de Denúncias (S13) com o chat do momento, o servidor e o round; as abertas, das mais antigas',
  })
  @ApiQuery({ name: 'status', required: false, enum: reportStatusSchema.options })
  @ApiQuery({ name: 'before', required: false, description: '`nextCursor` da página anterior' })
  @ApiQuery({ name: 'limit', required: false, description: `1 a ${STAFF_REPORTS_PAGE_MAX}` })
  @ApiOkResponse({ description: 'Uma página', standardSchema: staffReportPageSchema })
  reports(@Query() query: Record<string, string>): Promise<StaffReportPage> {
    const parsed = reportsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new StaffRejection(
        'invalid_body',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    const { status, before, limit } = parsed.data;
    return this.panel.reports(status, { ...(before && { before }), limit });
  }

  @Post('reports/:id/archive')
  @StaffOnly('reports.handle')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'archiveStaffReport',
    summary: 'Arquiva uma Denúncia aberta, com motivo (vai para o log de auditoria)',
  })
  @ApiNoContentResponse({ description: 'Arquivada' })
  @ApiNotFoundResponse(ERROR)
  @ApiConflictResponse(ERROR)
  async archiveReport(
    @CurrentStaff() actor: StaffActor,
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: staffReasonBodySchema }) body: StaffReasonBody,
  ): Promise<void> {
    await this.panel.archiveReport(actor, id, body.reason);
  }

  @Get('audit')
  @StaffOnly('audit.read')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'listStaffAudit',
    summary: 'Log de auditoria da Staff, do mais recente ao mais antigo, com filtros',
  })
  @ApiQuery({ name: 'actor', required: false, description: 'SteamID64 de quem fez' })
  @ApiQuery({ name: 'target', required: false, description: 'SteamID64 da Conta-alvo' })
  @ApiQuery({ name: 'action', required: false, enum: staffAuditActionSchema.options })
  @ApiQuery({ name: 'before', required: false, description: '`nextCursor` da página anterior' })
  @ApiQuery({ name: 'limit', required: false, description: `1 a ${STAFF_AUDIT_PAGE_MAX}` })
  @ApiOkResponse({ description: 'Uma página', standardSchema: staffAuditPageSchema })
  audit(@Query() query: Record<string, string>): Promise<StaffAuditPage> {
    const parsed = auditQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new StaffRejection(
        'invalid_body',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    const { actor, target, action, before, limit } = parsed.data;
    return this.panel.auditPage({
      ...(actor && { actorSteamId: actor }),
      ...(target && { targetSteamId: target }),
      ...(action && { action }),
      ...(before && { before }),
      limit,
    });
  }
}
