import 'reflect-metadata';
import rateLimit from '@fastify/rate-limit';
import { HttpException, HttpStatus, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/config.js';
import { buildOpenApiDocument } from './openapi/openapi.js';
import { VALKEY } from './valkey/valkey.module.js';

export const API_PREFIX = 'api';

/**
 * Monta a aplicação sem escutar porta; usada pelo main, pelos testes e pelo gerador de OpenAPI.
 * Em `preview`, o Nest só monta o grafo de módulos, sem instanciar providers (sem conexões).
 */
export async function createApp(
  config: AppConfig,
  options: { preview?: boolean } = {},
): Promise<NestFastifyApplication> {
  const preview = options.preview ?? false;
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config),
    new FastifyAdapter(),
    { bufferLogs: !preview, preview, ...(preview && { logger: ['error'] }) },
  );
  if (!preview) {
    app.useLogger(app.get(Logger));
    // Só nas rotas com @RouteConfig({ rateLimit }); contagem no Valkey, compartilhada entre
    // instâncias da API. Com o Valkey fora, a rota responde sem limite em vez de falhar.
    await app.register(rateLimit, {
      global: false,
      max: config.equippedRateLimitPerMinute,
      timeWindow: '1 minute',
      redis: app.get(VALKEY),
      nameSpace: 'carmine:rate-limit:',
      skipOnError: true,
      // Uma HttpException, para o filtro de exceções do Nest responder 429 (e não 500).
      errorResponseBuilder: (_, context) =>
        new HttpException(
          `Muitas requisições; tente de novo em ${context.after}`,
          HttpStatus.TOO_MANY_REQUESTS,
        ),
    });
  }
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();

  if (config.nodeEnv !== 'production' && !preview) {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApiDocument(app));
  }
  return app;
}
