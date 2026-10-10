import 'reflect-metadata';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/config.js';
import { buildOpenApiDocument } from './openapi/openapi.js';

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
  }
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();

  if (config.nodeEnv !== 'production' && !preview) {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApiDocument(app));
  }
  return app;
}
