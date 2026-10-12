import type { Cs2Item } from '@carmine/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamptz = () => timestamp({ withTimezone: true });

/** Modo (`Mode`) de um Servidor Carmine. */
export const gameMode = pgEnum('game_mode', ['retake', 'deathmatch']);

/** Onde o Servidor Carmine roda (S06); no MVP, só a VPS de São Paulo (ADR 0009). */
export const gameServerRegion = pgEnum('game_server_region', ['sao-paulo']);

/** Servidor Carmine (`GameServer`): uma instância de CS2 de um único Modo. */
export const gameServers = pgTable('game_servers', {
  id: uuid().primaryKey().defaultRandom(),
  /** Identificador curto usado pela Staff no CLI (ex.: `retake-1`). */
  name: text().notNull().unique(),
  mode: gameMode().notNull(),
  /** `host:porta` público do servidor. */
  address: text().notNull(),
  region: gameServerRegion().notNull().default('sao-paulo'),
  /** SHA-256 da chave do servidor; a chave em si só é mostrada uma vez, ao gerar. */
  keyHash: text().notNull().unique(),
  keyRotatedAt: timestamptz().notNull().defaultNow(),
  createdAt: timestamptz().notNull().defaultNow(),
});

/** Contador `n` do ID público (ADR 0013): cada valor vira um bloco exclusivo de 3 números. */
export const publicIdCounter = pgSequence('public_id_counter', { startWith: 0, minValue: 0 });

/** Conta (`Account`): nasce no primeiro connect a um Servidor Carmine (ADR 0007). */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    steamId: bigint({ mode: 'bigint' }).notNull().unique(),
    publicId: bigint({ mode: 'number' }).notNull().unique(),
    /** Último nome Steam visto no jogo, sem filtro. */
    steamName: text().notNull(),
    displayName: text().notNull(),
    /** URL do avatar Steam; nulo enquanto a Steam não respondeu (vale o avatar neutro). */
    avatarUrl: text(),
    avatarFetchedAt: timestamptz(),
    /** Nulo enquanto a Conta não foi reivindicada por login Steam no site (S03). */
    claimedAt: timestamptz(),
    /** Nulos enquanto a Conta nunca conectou num Servidor Carmine (criada pelo site, S03). */
    firstConnectedAt: timestamptz(),
    lastConnectedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [check('accounts_public_id_positive', sql`${table.publicId} > 0`)],
);

/**
 * Item (`Item`) do Inventário de uma Conta (S04). O Item fica inteiro em `item`, no formato
 * `CS2BaseInventoryItem` da cs2-lib (ADR 0006) já validado pela API: é o formato que o viewer, a
 * validação e a conversão para o `equipped/v5` usam, e nenhuma consulta precisa dos atributos
 * em colunas. O `id` é estável: Loadout e Presets (S05) o referenciam.
 *
 * Remover é soft delete (`deletedAt`): o Desfazer devolve o mesmo `id` sem recriar nada, e os
 * slots continuam apontando para ele (as leituras ignoram Itens removidos), então ele volta aos
 * mesmos lugares. Passada a janela do Desfazer, a linha só espera a limpeza.
 */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    item: jsonb().$type<Cs2Item>().notNull(),
    /**
     * `uid` numérico do Item no `equipped/v5` (o plugin usa `int`). Não é exposto ao web, que
     * usa o `id`.
     */
    econUid: integer().generatedAlwaysAsIdentity().notNull().unique(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
    /** Removido em; nulo enquanto o Item está no Inventário. */
    deletedAt: timestamptz(),
  },
  (table) => [index('inventory_items_account_idx').on(table.accountId, table.createdAt)],
);

/**
 * Período VIP (`VipPeriod`): o intervalo `[startsAt, endsAt)` em que a Conta tem VIP. A
 * concessão e a revogação pela Staff (S05, com auditoria) e os Pacotes VIP (S14) mexem aqui.
 */
export const vipPeriods = pgTable(
  'vip_periods',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    index('vip_periods_account_idx').on(table.accountId, table.endsAt),
    check('vip_periods_ends_after_start', sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

/**
 * Preset (`Preset`): um Loadout salvo com nome. O ativo é o Loadout (o que vai para o jogo).
 * Toda Conta tem um principal (`main`), criado na primeira leitura ou mutação do Loadout.
 */
export const presets = pgTable(
  'presets',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    main: boolean().notNull().default(false),
    active: boolean().notNull().default(false),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('presets_one_main_idx').on(table.accountId).where(sql`${table.main}`),
    uniqueIndex('presets_one_active_idx').on(table.accountId).where(sql`${table.active}`),
    index('presets_account_idx').on(table.accountId, table.createdAt),
  ],
);

/** Lado de um slot; `any` é o do music kit, que não tem lado (`side: null` no contrato). */
export const loadoutSlotSide = pgEnum('loadout_slot_side', ['ct', 't', 'any']);

/** Um Item equipado num slot e lado de um Preset. Slot sem linha = Arma padrão. */
export const loadoutSlots = pgTable(
  'loadout_slots',
  {
    presetId: uuid()
      .notNull()
      .references(() => presets.id, { onDelete: 'cascade' }),
    /** `weapon_<modelo>`, `knife`, `gloves`, `agent` ou `musicKit` (`LoadoutSlot`). */
    slot: text().notNull(),
    side: loadoutSlotSide().notNull(),
    itemId: uuid()
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.presetId, table.slot, table.side] }),
    index('loadout_slots_item_idx').on(table.itemId),
  ],
);

/** Ações da Staff registradas no log de auditoria. */
export const staffAuditAction = pgEnum('staff_audit_action', ['vip_grant', 'vip_revoke']);

/**
 * Log de auditoria das ações da Staff (S05: conceder e revogar Período VIP): autor, ação, alvo,
 * motivo e horário. Só cresce; a Conta-alvo apagada deixa o registro com o SteamID64.
 */
export const staffAuditLog = pgTable(
  'staff_audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** SteamID64 de quem fez (a Staff). Os papéis da Staff chegam na S07. */
    actorSteamId: bigint({ mode: 'bigint' }).notNull(),
    action: staffAuditAction().notNull(),
    targetAccountId: uuid().references(() => accounts.id, { onDelete: 'set null' }),
    targetSteamId: bigint({ mode: 'bigint' }).notNull(),
    reason: text().notNull(),
    /** O que mudou, ex.: `{ days, endsAtBefore, endsAtAfter }`. */
    details: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    index('staff_audit_log_target_idx').on(table.targetSteamId, table.createdAt),
    check('staff_audit_log_reason_present', sql`length(trim(${table.reason})) > 0`),
  ],
);
