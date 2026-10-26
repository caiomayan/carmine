import 'reflect-metadata';
import cookie from '@fastify/cookie';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { captureException } from '@sentry/node';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { registerAvatarUpload } from './avatars/avatar-upload.js';
import type { AppConfig } from './config/config.js';
import { registerDefaultHeaders } from './default-headers.js';
import { buildOpenApiDocument } from './openapi/openapi.js';
import { SentryExceptionFilter } from './sentry/sentry-exception-filter.js';

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
  // Cookies da sessão do site (S03); nenhum é assinado: o id da sessão já é aleatório e opaco.
  await app.register(cookie);
  registerDefaultHeaders(app);
  registerAvatarUpload(app.getHttpAdapter().getInstance());
  if (!preview) {
    app.useLogger(app.get(Logger));
  }
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  if (config.sentry.dsn !== null && !preview) {
    app.useGlobalFilters(
      new SentryExceptionFilter(app.get(HttpAdapterHost).httpAdapter, captureException),
    );
  }

  if (config.nodeEnv !== 'production' && !preview) {
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApiDocument(app));
  }
  return app;
}
