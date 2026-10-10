import { z } from 'zod';

/**
 * Formato `equipped/v5` do cs2-css-inventory-simulator (ADR 0006), copiado de
 * https://github.com/ianlucas/cs2-inventory-simulator/blob/main/docs/api.md. O plugin roda sem
 * modificação, então os nomes e tipos dos campos não podem mudar. As chaves dos mapas são
 * números: o time (2 = TR, 3 = CT) em agentes, luvas e facas; o def da arma em `ctWeapons` e
 * `tWeapons`.
 */
const numericKey = z.string().regex(/^\d+$/);

const stickerSchema = z.object({
  def: z.int(),
  rotation: z.number().optional(),
  schema: z.int().optional(),
  slot: z.int(),
  wear: z.number(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const keychainSchema = z.object({
  def: z.int(),
  seed: z.int(),
  slot: z.int(),
  sticker: z.int().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
});

export const weaponEconItemSchema = z
  .object({
    def: z.int(),
    hash: z.string(),
    nametag: z.string(),
    paint: z.int(),
    seed: z.int(),
    stattrak: z.int(),
    stickers: z.array(stickerSchema),
    keychains: z.array(keychainSchema),
    uid: z.int(),
    wear: z.number(),
  })
  .meta({ id: 'WeaponEconItem' });

export const meleeEconItemSchema = z
  .object({
    def: z.int(),
    hash: z.string(),
    nametag: z.string(),
    paint: z.int(),
    seed: z.int(),
    stattrak: z.int(),
    stickers: z.array(z.never()),
    uid: z.int(),
    wear: z.number(),
  })
  .meta({ id: 'MeleeEconItem' });

export const glovesEconItemSchema = z
  .object({
    def: z.int(),
    hash: z.string(),
    paint: z.int(),
    seed: z.int(),
    wear: z.number(),
  })
  .meta({ id: 'GlovesEconItem' });

export const agentEconItemSchema = z
  .object({
    def: z.int(),
    hash: z.string(),
    stickers: z.array(z.object({ def: z.int(), slot: z.int() })),
  })
  .meta({ id: 'AgentEconItem' });

export const musicKitEconItemSchema = z
  .object({ musicId: z.int(), stattrak: z.int(), uid: z.int() })
  .meta({ id: 'MusicKitEconItem' });

/** Corpo de `GET /api/equipped/v5/{steamId}.json`. Sem Item equipado, o slot usa a Arma padrão. */
export const equippedV5Schema = z
  .object({
    agents: z.record(numericKey, agentEconItemSchema).optional(),
    ctWeapons: z.record(numericKey, weaponEconItemSchema).optional(),
    gloves: z.record(numericKey, glovesEconItemSchema).optional(),
    knives: z.record(numericKey, meleeEconItemSchema).optional(),
    musicKit: musicKitEconItemSchema.optional(),
    tWeapons: z.record(numericKey, weaponEconItemSchema).optional(),
  })
  .meta({ id: 'EquippedV5' });

export type EquippedV5 = z.infer<typeof equippedV5Schema>;
