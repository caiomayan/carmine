import { z } from 'zod';

/** Menor e maior SteamID64 de conta individual (universo público, tipo individual, instância 1). */
const MIN_INDIVIDUAL_STEAM_ID = 76561197960265729n;
const MAX_INDIVIDUAL_STEAM_ID = 76561202255233023n;

/**
 * SteamID64 de uma conta individual, sempre como texto: o número não cabe num `number` do
 * JavaScript sem perder precisão.
 */
export const steamId64Schema = z
  .string()
  .regex(/^\d{17}$/, 'deve ter 17 dígitos')
  .refine(
    (value) => {
      // O Zod roda o refine mesmo quando o regex falha; o regex já reportou esse caso.
      if (!/^\d{17}$/.test(value)) return true;
      const id = BigInt(value);
      return id >= MIN_INDIVIDUAL_STEAM_ID && id <= MAX_INDIVIDUAL_STEAM_ID;
    },
    { message: 'não é o SteamID64 de uma conta individual' },
  )
  .meta({ id: 'SteamId64', example: '76561198000000000' });

export type SteamId64 = z.infer<typeof steamId64Schema>;
