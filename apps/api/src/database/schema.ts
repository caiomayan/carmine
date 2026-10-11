import type { Cs2Item } from '@carmine/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamptz = () => timestamp({ withTimezone: true });

/** Modo (`Mode`) de um Servidor Carmine. */
export const gameMode = pgEnum('game_mode', ['retake', 'deathmatch']);

/** Servidor Carmine (`GameServer`): uma instância de CS2 de um único Modo. */
export const gameServers = pgTable('game_servers', {
  id: uuid().primaryKey().defaultRandom(),
  /** Identificador curto usado pela Staff no CLI (ex.: `retake-1`). */
  name: text().notNull().unique(),
  mode: gameMode().notNull(),
  /** `host:porta` público do servidor. */
  address: text().notNull(),
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
 * Remover é soft delete (`deletedAt`): o Desfazer devolve o mesmo `id` (e, na S05, os mesmos
 * slots) sem recriar nada. Passada a janela do Desfazer, a linha só espera a limpeza.
 */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    item: jsonb().$type<Cs2Item>().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
    /** Removido em; nulo enquanto o Item está no Inventário. */
    deletedAt: timestamptz(),
  },
  (table) => [index('inventory_items_account_idx').on(table.accountId, table.createdAt)],
);

/**
 * Período VIP (`VipPeriod`): o intervalo `[startsAt, endsAt)` em que a Conta tem VIP. Só leitura
 * na S04; a concessão pela Staff (S05) e os Pacotes VIP (S14) criam Períodos.
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
