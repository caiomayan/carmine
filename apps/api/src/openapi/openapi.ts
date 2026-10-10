import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** Documento OpenAPI da API; é a fonte do cliente C# dos plugins (ADR 0004). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Carmine API')
    .setDescription(
      'API da plataforma Carmine, usada pelo web e pelos plugins dos Servidores Carmine.',
    )
    .setVersion('0.2.0')
    // Rotas /api/server/*: a chave do Servidor Carmine (ADR 0005).
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Chave do Servidor Carmine' })
    .build();
  return SwaggerModule.createDocument(app, config);
}
