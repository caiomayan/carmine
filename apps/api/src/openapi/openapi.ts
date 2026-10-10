import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** Documento OpenAPI da API; é a fonte do cliente C# dos plugins (ADR 0004). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Carmine API')
    .setDescription(
      'API da plataforma Carmine, usada pelo web e pelos plugins dos Servidores Carmine.',
    )
    .setVersion('0.1.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}
