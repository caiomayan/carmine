import { type HeaderPreviews, headerPreviewsSchema, type LoadoutSide } from '@carmine/contracts';
import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { HeaderPreviewsReader } from './header-previews.js';

/** O último lado do Loadout, como o navegador o guarda; qualquer outro valor vale `ct`. */
const sideOf = (value: string | undefined): LoadoutSide => (value === 't' ? 't' : 'ct');

/** O que os painéis do header mostram ao passar o mouse (U3e). */
@ApiTags('header')
@Controller('header-previews')
export class HeaderPreviewsController {
  constructor(@Inject(HeaderPreviewsReader) private readonly previews: HeaderPreviewsReader) {}

  @Get()
  @RateLimit('public')
  @ApiCookieAuth()
  @ApiOperation({
    operationId: 'getHeaderPreviews',
    summary:
      'Prévias dos painéis do header (Jogar, Loadout, Inventário, Ranking); a parte pessoal vem com a sessão',
  })
  @ApiQuery({
    name: 'side',
    required: false,
    enum: ['ct', 't'],
    description: 'O último lado usado no Loadout (o navegador o guarda); sem ele vale ct',
  })
  @ApiOkResponse({
    description:
      'As prévias. Cada seção é independente: uma fonte que falha esvazia só a sua seção. Com sessão, Cache-Control: private',
    standardSchema: headerPreviewsSchema,
  })
  async get(
    @Query('side') side: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<HeaderPreviews> {
    const accountId = request.carmineSession?.accountId ?? null;
    reply.header('vary', 'Cookie');
    reply.header(
      'cache-control',
      accountId === null ? 'public, max-age=10' : 'private, max-age=10',
    );
    return this.previews.read(accountId, sideOf(side));
  }
}
