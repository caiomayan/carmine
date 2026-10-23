import { type RecentActivity, recentActivitySchema } from '@carmine/contracts';
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { RecentActivityReader } from './recent-activity.js';

/** A faixa de atividade ao vivo da home (Marquee). */
@ApiTags('activity')
@Controller('activity')
export class ActivityController {
  constructor(@Inject(RecentActivityReader) private readonly activity: RecentActivityReader) {}

  @Get('recent')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getRecentActivity',
    summary:
      'Os últimos acontecimentos interessantes nos servidores (entrar, multi-kill, novo primeiro lugar, skin rara equipada), sem SteamID; Perfil privado não aparece (exceto como "Jogador privado" no primeiro lugar)',
  })
  @ApiOkResponse({
    description: 'Até 20 eventos, do mais novo ao mais antigo',
    standardSchema: recentActivitySchema,
  })
  async recent(@Res({ passthrough: true }) reply: FastifyReply): Promise<RecentActivity> {
    const seconds = this.activity.cacheSeconds;
    reply.header('cache-control', seconds > 0 ? `public, max-age=${seconds}` : 'no-store');
    return this.activity.read();
  }
}
