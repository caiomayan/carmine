import './zod-jitless.js';
import { z } from 'zod';

/**
 * Corpo de `GET /api/health`, a rota pública: só o status geral, sem detalhes internos
 * (mensagens de erro e latências revelam a infraestrutura).
 */
export const healthStatusSchema = z
  .object({ status: z.enum(['ok', 'unavailable']) })
  .meta({ id: 'HealthStatus' });

export type HealthStatus = z.infer<typeof healthStatusSchema>;

/** Resultado da verificação de uma dependência da API (Postgres, Valkey). */
export const dependencyCheckSchema = z
  .object({
    status: z.enum(['up', 'down']),
    latencyMs: z.int().nonnegative(),
    error: z.string().optional(),
  })
  .meta({ id: 'DependencyCheck' });

export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;

/**
 * Corpo de `GET /api/server/health`, só para Servidores Carmine autenticados: `ok` só quando
 * todas as dependências estão no ar, com o detalhe de cada uma.
 */
export const healthReportSchema = z
  .object({
    status: healthStatusSchema.shape.status,
    checks: z.object({
      database: dependencyCheckSchema,
      valkey: dependencyCheckSchema,
    }),
  })
  .meta({ id: 'HealthReport' });

export type HealthReport = z.infer<typeof healthReportSchema>;
