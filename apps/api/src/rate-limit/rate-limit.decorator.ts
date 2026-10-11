import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiServiceUnavailableResponse, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { RATE_LIMIT_POLICIES, type RateLimitPolicyName } from './policies.js';
import { RATE_LIMIT_POLICY, RateLimitGuard } from './rate-limit.guard.js';

const SUBJECTS = {
  ip: 'IP',
  session: 'sessão (sem sessão, IP)',
  gameServer: 'Servidor Carmine',
} as const;

/**
 * Limita a rota pela política `name` (`policies.ts`). Use no método, não no controller: o
 * guard precisa rodar depois dos guards do controller (o `ServerKeyGuard` identifica o
 * servidor) e, abaixo de outro `@UseGuards` do método, roda antes dele (o `/api/me` conta
 * também quem não tem sessão).
 *
 * Toda resposta da rota traz `RateLimit-Policy` e `RateLimit` (draft IETF
 * httpapi-ratelimit-headers); acima do limite, 429 com `Retry-After` em segundos.
 */
export function RateLimit(name: RateLimitPolicyName): MethodDecorator {
  const policy = RATE_LIMIT_POLICIES[name];
  const decorators = [
    SetMetadata(RATE_LIMIT_POLICY, name),
    UseGuards(RateLimitGuard),
    ApiTooManyRequestsResponse({
      description: `Limite de requisições por ${SUBJECTS[policy.subject]} excedido (política "${name}")`,
      headers: {
        'Retry-After': {
          description: 'Segundos até a próxima requisição ser aceita',
          schema: { type: 'integer' },
        },
        RateLimit: {
          description: `Vagas restantes (r) e segundos até repor (t), ex.: "${name}";r=0;t=15`,
          schema: { type: 'string' },
        },
        'RateLimit-Policy': {
          description: `Cota (q) por janela em segundos (w), ex.: "${name}";q=240;w=60`,
          schema: { type: 'string' },
        },
      },
    }),
  ];
  if (policy.whenUnavailable === 'deny') {
    decorators.push(
      ApiServiceUnavailableResponse({
        description: 'Sem como contar o limite agora; tente de novo',
      }),
    );
  }
  return applyDecorators(...decorators);
}
