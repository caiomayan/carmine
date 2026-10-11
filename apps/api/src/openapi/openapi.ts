import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { SESSION_COOKIE } from '../auth/session-cookies.js';

/** Documento OpenAPI da API; é a fonte do cliente C# dos plugins (ADR 0004). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Carmine API')
    .setDescription(
      'API da plataforma Carmine, usada pelo web e pelos plugins dos Servidores Carmine.',
    )
    .setVersion('0.4.0')
    // Rotas /api/server/*: a chave do Servidor Carmine (ADR 0005).
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Chave do Servidor Carmine' })
    // Rotas do site: a sessão do login Steam; mutações também exigem o cabeçalho x-csrf-token.
    .addCookieAuth(SESSION_COOKIE, {
      type: 'apiKey',
      in: 'cookie',
      description: 'Sessão do login Steam (mesma origem do web, ADR 0015)',
    })
    .build();
  return SwaggerModule.createDocument(app, config);
}
