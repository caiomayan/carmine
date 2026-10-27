import type { Cs2Item } from '@carmine/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
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
  /** Nome de vitrine (S07), ex.: "Retake · Rotação"; nulo até a Staff definir. */
  showcaseName: text(),
  /** Código do servidor (S07), região·número, ex.: "SP·2"; único. */
  code: text().unique(),
  /** SHA-256 da chave do servidor; a chave em si só é mostrada uma vez, ao gerar. */
  keyHash: text().notNull().unique(),
  keyRotatedAt: timestamptz().notNull().defaultNow(),
  createdAt: timestamptz().notNull().defaultNow(),
  /**
   * Aposentado pelo CLI (`servers retire`): some da lista pública e a chave para de valer, mas a
   * linha fica (o log de auditoria e o histórico apontam para ela). Nulo: em operação.
   */
  retiredAt: timestamptz(),
});

/** Contador `n` do ID público (ADR 0013): cada valor vira um bloco exclusivo de 3 números. */
export const publicIdCounter = pgSequence('public_id_counter', { startWith: 0, minValue: 0 });

/** De onde vem o avatar efetivo da Conta (ADR 0022). */
export const avatarSource = pgEnum('avatar_source', ['steam', 'custom']);

/** Conta (`Account`): nasce no primeiro connect a um Servidor Carmine (ADR 0007). */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    /**
     * SteamID64. Numa Conta anonimizada (S08) sem ban valendo, vira `-publicId`: o vínculo com a
     * Steam se desfaz e quem voltar a jogar ganha uma Conta nova (ver `AccountErasure`).
     */
    steamId: bigint({ mode: 'bigint' }).notNull().unique(),
    publicId: bigint({ mode: 'number' }).notNull().unique(),
    /** Último nome Steam visto no jogo, sem filtro. */
    steamName: text().notNull(),
    displayName: text().notNull(),
    /**
     * Nome Steam cujo Nome de exibição a Staff resetou (S07): enquanto a Conta tiver esse nome
     * Steam, ela aparece com um nome fictício fixo (`placeholderNameFor`). Trocar o nome Steam libera o novo (pelo filtro).
     */
    displayNameBlockedSteamName: text(),
    /**
     * Nome de exibição próprio, já normalizado (S11); nulo: vale o nome Steam. `displayName`
     * guarda o nome efetivo (o que o jogo e o site mostram) e é recalculado a cada connect.
     */
    customDisplayName: text(),
    /** Última troca do nome (ou reset da Staff que apagou o nome próprio); base dos 7 dias. */
    displayNameChangedAt: timestamptz(),
    /** Perfil privado (S11): esconde as Estatísticas e a identidade no Ranking. */
    profilePrivate: boolean().notNull().default(false),
    /**
     * O avatar efetivo, o que todo mundo lê: a URL do avatar Steam (`avatarSource` `steam`) ou a
     * da foto própria no ar (`custom`, ADR 0022). Nulo enquanto a Steam não respondeu (vale o
     * avatar neutro).
     */
    avatarUrl: text(),
    avatarFetchedAt: timestamptz(),
    /** O avatar da Steam, sempre guardado: é para onde a Conta volta. O `AvatarRefresher` o mantém. */
    steamAvatarUrl: text(),
    avatarSource: avatarSource().notNull().default('steam'),
    /** Envio de foto bloqueado até aqui (reincidente, ADR 0022); só a Staff vê. */
    avatarUploadBlockedUntil: timestamptz(),
    /** Nulo enquanto a Conta não foi reivindicada por login Steam no site (S03). */
    claimedAt: timestamptz(),
    /** Nulos enquanto a Conta nunca conectou num Servidor Carmine (criada pelo site, S03). */
    firstConnectedAt: timestamptz(),
    lastConnectedAt: timestamptz(),
    /** `!chat off` no jogo: o jogador não vê o chat dos outros. Padrão: chat visível. */
    chatHidden: boolean().notNull().default(false),
    /** Anonimizada por um pedido de exclusão de dados (S08); nulo: Conta normal. */
    anonymizedAt: timestamptz(),
    /**
     * Quando a Staff trocou o ID automático por um ID reservado (S10, ADR 0013). Preenchido, o ID
     * público não muda mais; o ID antigo fica em `account_public_id_history`.
     */
    publicIdReservedAt: timestamptz(),
    /**
     * A Staff bloqueou as compras da Conta (S14): uma contestação de pagamento bloqueia até a Staff
     * revisar. Nulo: pode comprar. Não afeta o VIP que a Conta já tem.
     */
    purchaseBlockedAt: timestamptz(),
    purchaseBlockReason: text(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [check('accounts_public_id_positive', sql`${table.publicId} > 0`)],
);

/**
 * IDs públicos que uma Conta já teve (S10): o link antigo `/<idAntigo>` responde 301 para o ID
 * atual. Um ID aqui nunca é reaproveitado por outra Conta.
 */
export const accountPublicIdHistory = pgTable('account_public_id_history', {
  publicId: bigint({ mode: 'number' }).primaryKey(),
  accountId: uuid()
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  replacedAt: timestamptz().notNull().defaultNow(),
});

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

/** Estado do pagamento de um Pacote VIP (S14); ver `PAYMENT_STATUSES` nos contratos. */
export const paymentStatus = pgEnum('payment_status', [
  'created',
  'pending',
  'in_review',
  'approved',
  'rejected',
  'expired',
  'cancelled',
  'refunded',
  'partially_refunded',
  'charged_back',
]);

export const paymentMethod = pgEnum('payment_method', ['pix', 'card']);

/**
 * Pagamento de um Pacote VIP (S14). O VIP só é concedido depois que o provedor confirma
 * (webhook + consulta); `provider_payment_id` é único por provedor, e o Período VIP gerado aponta
 * para cá (`vip_periods.payment_id`, único), então a mesma confirmação nunca concede duas vezes. O
 * preço fica no pagamento (vale o do momento da compra). O CPF do Pagador, que só o provedor
 * conhece, fica cifrado; só os 3 últimos dígitos são legíveis. Registro de pagamento NÃO é
 * apagado na anonimização da Conta (prazo legal de 5 anos).
 */
export const payments = pgTable(
  'payments',
  {
    /** Também a `external_reference` mandada ao provedor. */
    id: uuid().primaryKey().defaultRandom(),
    /** A Conta beneficiada do VIP. */
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    package: text().notNull(),
    days: integer().notNull(),
    amountCents: integer().notNull(),
    method: paymentMethod().notNull(),
    status: paymentStatus().notNull().default('created'),
    /** `mercadopago` ou `fake` (dev e homologação). */
    provider: text().notNull(),
    providerPaymentId: text(),
    /** Pix: o "copia e cola" e o QR em PNG (base64); recuperáveis até o vencimento. */
    pixCopyPaste: text(),
    pixQrBase64: text(),
    /** Cartão: o checkout hospedado do provedor. */
    redirectUrl: text(),
    expiresAt: timestamptz(),
    approvedAt: timestamptz(),
    refundedCents: integer().notNull().default(0),
    /** Dias do Pacote já tirados do VIP por reembolso ou contestação (para nunca tirar duas vezes). */
    refundedDays: integer().notNull().default(0),
    refundedAt: timestamptz(),
    chargedBackAt: timestamptz(),
    /** A declaração de maioridade do Pagador: quando e qual texto. */
    adultDeclaredAt: timestamptz().notNull(),
    declarationVersion: text().notNull(),
    /** CPF do Pagador (cifrado, AES-256-GCM) e os 3 últimos dígitos; nome vindo do provedor. */
    payerDocumentEncrypted: text(),
    payerDocumentLast3: text(),
    payerName: text(),
    /** Por que a cobrança não existe/foi cancelada por nós (erro do provedor...). */
    failureReason: text(),
    /** A chave de idempotência do cliente: o duplo clique devolve a mesma compra. */
    idempotencyKey: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payments_provider_payment_idx')
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} is not null`),
    uniqueIndex('payments_account_idempotency_idx').on(table.accountId, table.idempotencyKey),
    index('payments_account_idx').on(table.accountId, table.createdAt),
    index('payments_status_idx').on(table.status, table.createdAt),
    check('payments_amount_positive', sql`${table.amountCents} > 0`),
  ],
);

/**
 * Cada webhook de pagamento recebido (S14): serve de log e de auditoria. Webhook com assinatura
 * inválida também entra (sem consultar nada). Guardado por `PAYMENT_EVENT_RETENTION_DAYS`.
 */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    /** O `x-request-id` do provedor, quando vem. */
    requestId: text(),
    topic: text(),
    resourceId: text(),
    signatureValid: boolean().notNull(),
    paymentId: uuid().references(() => payments.id),
    /** O que a API fez: `applied`, `unchanged`, `ignored`, `invalid_signature`, `mismatch`, `error`. */
    outcome: text().notNull(),
    detail: text(),
    receivedAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    index('payment_events_received_idx').on(table.receivedAt),
    index('payment_events_payment_idx').on(table.paymentId),
  ],
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
    /** O pagamento que gerou este Período (S14); nulo: concessão da Staff. Único: uma confirmação, um Período. */
    paymentId: uuid()
      .unique()
      .references(() => payments.id),
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

/**
 * Itens VIP guardados (S14, D3). Quando o VIP da Conta acaba, os Itens que só existem com VIP saem do
 * Inventário e do Loadout e ficam aqui por 30 dias; se o VIP volta, voltam inteiros, nos mesmos slots.
 * Tirar do Inventário de verdade (em vez de filtrar na leitura) garante que nenhuma tela, nem o jogo,
 * enxerga o que está guardado. Dois tipos:
 * - `item`: agente ou kit de música inteiro (`item` é o registro todo; `slots`, onde estava equipado);
 * - `attributes`: o StatTrak e a nametag de uma skin que fica (`item` só tem esses campos).
 */
export const vipHeldItems = pgTable(
  'vip_held_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text().$type<'item' | 'attributes'>().notNull(),
    /** O `id` do registro em `inventory_items` (o mesmo na volta). */
    itemId: uuid().notNull(),
    item: jsonb().$type<Record<string, unknown>>().notNull(),
    /** Só em `item`: quando entrou no Inventário (a ordem da lista não muda na volta). */
    itemCreatedAt: timestamptz(),
    /** Só em `item`: os slots em que estava equipado. */
    slots: jsonb()
      .$type<Array<{ presetId: string; slot: string; side: 'ct' | 't' | 'any' }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Quando o VIP acabou; os 30 dias contam daqui. */
    heldAt: timestamptz().notNull(),
  },
  (table) => [
    uniqueIndex('vip_held_items_item_idx').on(table.accountId, table.itemId),
    index('vip_held_items_held_idx').on(table.heldAt),
  ],
);

/** Ações da Staff registradas no log de auditoria (`StaffAuditAction`). */
export const staffAuditAction = pgEnum('staff_audit_action', [
  'vip_grant',
  'vip_revoke',
  'sanction_apply',
  'sanction_revoke',
  'role_grant',
  'role_revoke',
  'display_name_reset',
  'server_update',
  'account_anonymize',
  'account_reserved_id',
  'ranking_entry_remove',
  'report_archive',
  'avatar_keep',
  'avatar_remove',
  'payment_refund',
  'purchase_unblock',
  'vip_compensation',
]);

/**
 * Log de auditoria das ações da Staff (S05 e S07): autor, ação, alvo (uma Conta ou um Servidor
 * Carmine), motivo e horário. Só cresce; a Conta-alvo apagada deixa o registro com o SteamID64.
 */
export const staffAuditLog = pgTable(
  'staff_audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** SteamID64 de quem fez (a Staff). Os papéis da Staff chegam na S07. */
    actorSteamId: bigint({ mode: 'bigint' }).notNull(),
    action: staffAuditAction().notNull(),
    targetAccountId: uuid().references(() => accounts.id, { onDelete: 'set null' }),
    /** Nulo quando o alvo é um Servidor Carmine. */
    targetSteamId: bigint({ mode: 'bigint' }),
    targetServerId: uuid().references(() => gameServers.id, { onDelete: 'set null' }),
    reason: text().notNull(),
    /** O que mudou, ex.: `{ days, endsAtBefore, endsAtAfter }`. */
    details: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    index('staff_audit_log_target_idx').on(table.targetSteamId, table.createdAt),
    index('staff_audit_log_actor_idx').on(table.actorSteamId, table.createdAt),
    index('staff_audit_log_created_idx').on(table.createdAt, table.id),
    check('staff_audit_log_reason_present', sql`length(trim(${table.reason})) > 0`),
  ],
);

/** Papel de Staff (`StaffRole`). */
export const staffRole = pgEnum('staff_role', ['owner', 'admin', 'moderator']);

/** Contas da Staff e o papel de cada uma (S07). Sem linha: não é da Staff. */
export const staffMembers = pgTable('staff_members', {
  accountId: uuid()
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  role: staffRole().notNull(),
  createdAt: timestamptz().notNull().defaultNow(),
  updatedAt: timestamptz().notNull().defaultNow(),
});

export const sanctionType = pgEnum('sanction_type', ['ban', 'mute', 'gag', 'kick', 'warning']);

/** Categoria de infração (`SanctionCategory`). */
export const sanctionCategory = pgEnum('sanction_category', [
  'offensive_chat',
  'offensive_voice',
  'griefing',
  'exploit',
  'discrimination',
  'cheat',
  'threat',
  'doxxing',
  'ban_evasion',
]);

/**
 * Punição (`Sanction`) de uma Conta, em todos os Servidores Carmine (S07). Ban, mute e gag valem
 * de `startsAt` até `endsAt` (nulo: permanente) e expiram sozinhas (a leitura compara com o
 * agora); kick e aviso são instantâneos (`endsAt` sempre nulo). As medidas aplicadas juntas
 * dividem o `incidentId`: a reincidência conta ocorrências, não medidas. Revogar não apaga:
 * marca quem, quando, por quê e se foi recurso aceito.
 */
export const sanctions = pgTable(
  'sanctions',
  {
    id: uuid().primaryKey().defaultRandom(),
    incidentId: uuid().notNull(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    type: sanctionType().notNull(),
    category: sanctionCategory().notNull(),
    /** Motivo livre, interno da Staff: nunca sai no Perfil nem no jogo. */
    reason: text().notNull(),
    /** Testemunha mencionada (texto livre, interno); ban por cheat exige ela ou a evidência. */
    witness: text(),
    /** Link da evidência anexada; cheat só aparece como "Cheat" no Perfil público com ela. */
    evidenceUrl: text(),
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz(),
    appliedBySteamId: bigint({ mode: 'bigint' }).notNull(),
    revokedAt: timestamptz(),
    revokedBySteamId: bigint({ mode: 'bigint' }),
    revokeReason: text(),
    /** Recurso aceito: some do Perfil público e da reincidência. */
    appealAccepted: boolean().notNull().default(false),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    index('sanctions_account_idx').on(table.accountId, table.startsAt),
    index('sanctions_recent_idx').on(table.startsAt),
    check(
      'sanctions_instant_without_end',
      sql`${table.type} in ('ban', 'mute', 'gag') or ${table.endsAt} is null`,
    ),
    check(
      'sanctions_ends_after_start',
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      'sanctions_revocation_complete',
      sql`(${table.revokedAt} is null) = (${table.revokedBySteamId} is null) and (${table.revokedAt} is null) = (${table.revokeReason} is null)`,
    ),
    check('sanctions_reason_present', sql`length(trim(${table.reason})) > 0`),
  ],
);

/**
 * IDs dos eventos de jogo já processados (S12, ADR 0018): a chave da idempotência. Um evento só
 * soma nas Estatísticas se o seu ID entrou aqui na mesma transação. O plugin nunca guarda um
 * evento por mais que algumas horas, então linhas antigas podem ser limpas (`receivedAt`).
 */
export const gameEvents = pgTable(
  'game_events',
  {
    id: uuid().primaryKey(),
    serverId: uuid()
      .notNull()
      .references(() => gameServers.id),
    receivedAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [index('game_events_received_idx').on(table.receivedAt)],
);

/**
 * Estatísticas (`Stats`) de uma Conta por Modo e por semana de Brasília (S12): as somas que o
 * Perfil lê (somando as semanas) e o Ranking semanal (PR B) usa direto. `weekStart` é a
 * segunda-feira da semana (`YYYY-MM-DD`). ADR, KPM, K/D e HS% saem destas contagens.
 */
export const accountStatsWeekly = pgTable(
  'account_stats_weekly',
  {
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    mode: gameMode().notNull(),
    weekStart: date({ mode: 'string' }).notNull(),
    kills: integer().notNull().default(0),
    deaths: integer().notNull().default(0),
    assists: integer().notNull().default(0),
    headshots: integer().notNull().default(0),
    /** Dano em inimigos (bots e aliados não entram). */
    damage: bigint({ mode: 'number' }).notNull().default(0),
    roundsPlayed: integer().notNull().default(0),
    roundsWon: integer().notNull().default(0),
    secondsPlayed: integer().notNull().default(0),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.mode, table.weekStart] }),
    index('account_stats_weekly_ranking_idx').on(table.mode, table.weekStart),
  ],
);

/** Lado de um jogador num round (S12b). */
export const gameTeam = pgEnum('game_team', ['ct', 't']);

/**
 * Atividade de uma Conta por Modo e por dia de Brasília (S12b): o mapa de calor do Perfil. Mesmas
 * somas de `account_stats_weekly`, escritas na mesma transação; o dia vem da hora do evento.
 * Guardada por `STATS_DAILY_RETENTION_DAYS` (o heatmap pede até 52 semanas).
 */
export const accountStatsDaily = pgTable(
  'account_stats_daily',
  {
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    mode: gameMode().notNull(),
    day: date({ mode: 'string' }).notNull(),
    kills: integer().notNull().default(0),
    deaths: integer().notNull().default(0),
    assists: integer().notNull().default(0),
    headshots: integer().notNull().default(0),
    damage: bigint({ mode: 'number' }).notNull().default(0),
    roundsPlayed: integer().notNull().default(0),
    roundsWon: integer().notNull().default(0),
    secondsPlayed: integer().notNull().default(0),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.mode, table.day] }),
    index('account_stats_daily_day_idx').on(table.day),
  ],
);

/**
 * Abates de uma Conta por arma e lado do assassino (S12b): o radar do Perfil, "de sempre". A arma
 * é a chave normalizada (`stats/weapons.ts`, uma das `STAT_WEAPONS`), então a cardinalidade é
 * limitada. Só entra a kill que conta nas Estatísticas e que veio com o lado (`killerTeam`).
 */
export const accountWeaponStats = pgTable(
  'account_weapon_stats',
  {
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    mode: gameMode().notNull(),
    weapon: text().notNull(),
    side: gameTeam().notNull(),
    kills: integer().notNull().default(0),
    headshots: integer().notNull().default(0),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.mode, table.weapon, table.side] })],
);

/**
 * Sessão de jogo (S12b): o `id` é o `sessionId` do plugin. O início e o fim chegam em eventos
 * separados e em qualquer ordem, então os dois são upserts na mesma linha. Sem `endedAt`: a Sessão
 * está aberta ou o servidor caiu (a leitura esconde as abertas há mais de 24 h sem presença).
 * Guardada por `PLAY_SESSION_RETENTION_DAYS`.
 */
export const playSessions = pgTable(
  'play_sessions',
  {
    id: uuid().primaryKey(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    serverId: uuid()
      .notNull()
      .references(() => gameServers.id),
    /** O Modo do servidor (da chave), não do evento. */
    mode: gameMode().notNull(),
    startedAt: timestamptz().notNull(),
    endedAt: timestamptz(),
    /** Fim − início, só com um fim válido (acima de zero e até 24 h). */
    seconds: integer(),
    /** O mapa em que a pessoa entrou; nulo se o plugin não disse. */
    map: text(),
    /** Os mapas distintos por onde passou, em ordem. */
    maps: text().array().notNull().default(sql`'{}'::text[]`),
  },
  (table) => [
    index('play_sessions_account_idx').on(table.accountId, table.startedAt),
    index('play_sessions_server_idx').on(table.serverId, table.startedAt),
    index('play_sessions_started_idx').on(table.startedAt),
  ],
);

/**
 * O histórico de rounds de um Servidor Carmine por hora cheia e mapa (S12b), para a página do
 * servidor. Só rounds de verdade (sem aquecimento) que vieram com o mapa; independe de haver
 * Conta. `firstRoundAt`/`lastRoundAt` e o placar do último round (`scoreCt`, `scoreT`,
 * `lastRoundNumber`) dão o intervalo e o placar final do mapa. Guardada por
 * `SERVER_HOURS_RETENTION_DAYS`.
 */
export const serverHours = pgTable(
  'server_hours',
  {
    serverId: uuid()
      .notNull()
      .references(() => gameServers.id),
    hourStart: timestamptz().notNull(),
    map: text().notNull(),
    roundsPlayed: integer().notNull().default(0),
    ctWins: integer().notNull().default(0),
    tWins: integer().notNull().default(0),
    firstRoundAt: timestamptz().notNull(),
    lastRoundAt: timestamptz().notNull(),
    lastRoundNumber: integer(),
    scoreCt: integer(),
    scoreT: integer(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.hourStart, table.map] }),
    index('server_hours_hour_idx').on(table.hourStart),
  ],
);

/**
 * Entradas que a Staff removeu do Ranking semanal (S12): Conta × Modo × semana, com o motivo. A
 * remoção não apaga as Estatísticas (`account_stats_weekly` continua igual); só tira a Conta
 * dessa semana do Ranking. O registro completo também vai para `staff_audit_log`.
 */
export const rankingRemovals = pgTable(
  'ranking_removals',
  {
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    mode: gameMode().notNull(),
    weekStart: date({ mode: 'string' }).notNull(),
    /** SteamID64 de quem removeu (a Staff). */
    removedBySteamId: bigint({ mode: 'bigint' }).notNull(),
    reason: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.mode, table.weekStart] }),
    index('ranking_removals_week_idx').on(table.mode, table.weekStart),
  ],
);

/** Kill em aliado: não conta nas Estatísticas, mas fica registrada para a moderação (S12). */
export const teamKills = pgTable(
  'team_kills',
  {
    /** O ID do evento. */
    id: uuid().primaryKey(),
    serverId: uuid()
      .notNull()
      .references(() => gameServers.id),
    killerAccountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    victimAccountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    weapon: text().notNull(),
    killedAt: timestamptz().notNull(),
  },
  (table) => [index('team_kills_killer_idx').on(table.killerAccountId, table.killedAt)],
);

/** Em que lado o jogador estava ao falar no chat (S13). */
export const chatTeam = pgEnum('chat_team', ['ct', 't', 'spectator']);

/**
 * Log de chat dos Servidores Carmine (S13, ADR 0019): toda mensagem dita, com o lado e se foi
 * chat de time. O `id` é o do evento (UUID v7 do plugin): é a chave da idempotência. Dura 30
 * dias (`DataRetention`); apagar a Conta (anonimização) apaga as linhas dela.
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid().primaryKey(),
    serverId: uuid()
      .notNull()
      .references(() => gameServers.id),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    team: chatTeam().notNull(),
    teamChat: boolean().notNull(),
    text: text().notNull(),
    /** Quando foi dito, pelo relógio do servidor. */
    at: timestamptz().notNull(),
    receivedAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    index('chat_messages_server_idx').on(table.serverId, table.at),
    index('chat_messages_account_idx').on(table.accountId, table.at),
    index('chat_messages_at_idx').on(table.at),
  ],
);

export const reportReason = pgEnum('report_reason', [
  'cheat',
  'voice',
  'offensive_chat',
  'griefing',
  'other',
]);

export const reportStatus = pgEnum('report_status', ['open', 'archived', 'sanctioned']);

/** Uma linha do chat copiada para dentro da Denúncia (sobrevive à limpeza dos 30 dias). */
export type ReportChatLineRow = {
  at: string;
  /** Nulo se a Conta foi anonimizada depois. */
  publicId: number | null;
  displayName: string;
  team: 'ct' | 't' | 'spectator';
  teamChat: boolean;
  text: string;
  fromTarget: boolean;
};

/**
 * Denúncia (`Report`, S13): um jogador avisa a Staff sobre outro, pelo `!report` no jogo. Leva o
 * servidor, o mapa, o round, o horário e as últimas linhas do chat (`chatContext`, uma cópia).
 * Fica na fila da Staff até ser arquivada (com motivo) ou virar Punição; some 90 dias depois de
 * criada (`DataRetention`).
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Nulo depois que o denunciante pede a exclusão dos dados. */
    reporterAccountId: uuid().references(() => accounts.id, { onDelete: 'set null' }),
    targetAccountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    serverId: uuid().references(() => gameServers.id),
    map: text(),
    round: integer(),
    reason: reportReason().notNull(),
    chatContext: jsonb().$type<ReportChatLineRow[]>().notNull(),
    status: reportStatus().notNull().default('open'),
    createdAt: timestamptz().notNull().defaultNow(),
    resolvedAt: timestamptz(),
    resolvedBySteamId: bigint({ mode: 'bigint' }),
    /** Motivo do arquivamento; nulo quando virou Punição. */
    resolutionReason: text(),
  },
  (table) => [
    index('reports_status_idx').on(table.status, table.createdAt),
    index('reports_reporter_idx').on(table.reporterAccountId, table.createdAt),
    index('reports_target_idx').on(table.targetAccountId, table.status),
    check(
      'reports_resolution_complete',
      sql`(${table.status} = 'open') = (${table.resolvedAt} is null) and (${table.status} = 'open') = (${table.resolvedBySteamId} is null)`,
    ),
  ],
);

/**
 * Vínculo da Conta com um usuário do Discord (S15). É só um vínculo, não um login (ADR 0007): guarda
 * o ID e o nome do Discord, nunca token (o `guilds.join` usa o token na hora do vínculo e o descarta).
 * Um Discord só liga a uma Conta (`discordId` único).
 */
export const discordLinks = pgTable('discord_links', {
  accountId: uuid()
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  /** ID (snowflake) do usuário no Discord. */
  discordId: text().notNull().unique(),
  /** Nome de usuário do Discord na hora do vínculo. */
  username: text().notNull(),
  linkedAt: timestamptz().notNull().defaultNow(),
  /** Cargos (`player`, `vip`, `staff`, `owner`) que a última reconciliação deixou aplicados. */
  syncedRoles: text().array().notNull().default(sql`'{}'::text[]`),
  /** Última reconciliação que conseguiu falar com o Discord; nulo: ainda não houve. */
  syncedAt: timestamptz(),
  /** A pessoa não está no servidor do Discord: só tenta de novo depois desse instante. */
  retryAt: timestamptz(),
});

/** A mensagem de status dos Servidores Carmine (S15): uma por canal, editada, nunca repostada. */
export const discordStatusMessages = pgTable('discord_status_messages', {
  channelId: text().primaryKey(),
  messageId: text().notNull(),
  updatedAt: timestamptz().notNull().defaultNow(),
});

/** Estado de uma foto de perfil própria (ADR 0022). */
export const avatarStatus = pgEnum('avatar_status', [
  'active',
  'suspended',
  'removed',
  'replaced',
  'reverted',
]);

/** Motivo de uma denúncia de foto ou da remoção pela Staff. */
export const avatarReason = pgEnum('avatar_reason', [
  'sexual',
  'violence',
  'hate',
  'minor',
  'personal_data',
  'other',
]);

/**
 * Foto de perfil própria (ADR 0022): publica na hora e a moderação vem depois. Os arquivos
 * (`avatars/<id>/<tamanho>.webp`) ficam no bucket público enquanto `active`; `suspended` (duas
 * Contas denunciaram) e `removed` (Staff) os tiram de lá e guardam o de 512 px no bucket
 * privado (`removed/<id>/512.webp`) até a limpeza; `replaced` e `reverted` os apagam. Uma Conta
 * tem no máximo uma foto `active` ou `suspended`.
 */
export const accountAvatars = pgTable(
  'account_avatars',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    status: avatarStatus().notNull().default('active'),
    createdAt: timestamptz().notNull().defaultNow(),
    /** Quando saiu do ar (suspensa ou removida). */
    takenDownAt: timestamptz(),
    /** Quando deixou de ser a foto da Conta (removida, trocada ou devolvida à Steam). */
    retiredAt: timestamptz(),
    /** A decisão da Staff (manter ou remover): a última. Nula sem decisão. */
    decision: text().$type<'keep' | 'remove'>(),
    decidedAt: timestamptz(),
    decidedBySteamId: bigint({ mode: 'bigint' }),
    decisionReason: avatarReason(),
    decisionNote: text(),
  },
  (table) => [
    uniqueIndex('account_avatars_current_idx')
      .on(table.accountId)
      .where(sql`${table.status} in ('active', 'suspended')`),
    index('account_avatars_account_idx').on(table.accountId, table.createdAt),
    index('account_avatars_removed_idx')
      .on(table.accountId, table.decidedAt)
      .where(sql`${table.status} = 'removed'`),
  ],
);

/**
 * Denúncia de uma foto (ADR 0022). Uma por Conta e foto; `dismissedAt` marca as arquivadas quando
 * a Staff mantém a foto. A Conta que denuncia e é excluída deixa a denúncia sem autor.
 */
export const avatarReports = pgTable(
  'avatar_reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    avatarId: uuid()
      .notNull()
      .references(() => accountAvatars.id, { onDelete: 'cascade' }),
    reporterAccountId: uuid().references(() => accounts.id, { onDelete: 'set null' }),
    reason: avatarReason().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    dismissedAt: timestamptz(),
  },
  (table) => [
    uniqueIndex('avatar_reports_once_idx').on(table.avatarId, table.reporterAccountId),
    index('avatar_reports_avatar_idx').on(table.avatarId, table.createdAt),
    index('avatar_reports_reporter_idx').on(table.reporterAccountId, table.createdAt),
  ],
);

/** Em que bucket do R2 um arquivo está (ADR 0022). */
export const mediaBucket = pgEnum('media_bucket', ['public', 'private']);

/**
 * Fila de remoção de arquivos do R2 (ADR 0022): o R2 não participa da transação do Postgres, então
 * trocar, devolver à Steam, excluir a Conta e a limpeza das removidas só enfileiram aqui, na mesma
 * transação, e um job apaga com nova tentativa. `runAt` no futuro é a retenção. `purge`: depois de
 * apagar do bucket público, tira a URL pública (origem + chave) do cache da CDN.
 */
export const mediaDeletions = pgTable(
  'media_deletions',
  {
    id: uuid().primaryKey().defaultRandom(),
    bucket: mediaBucket().notNull(),
    key: text().notNull(),
    purge: boolean().notNull().default(false),
    runAt: timestamptz().notNull().defaultNow(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('media_deletions_object_idx').on(table.bucket, table.key),
    index('media_deletions_due_idx').on(table.runAt),
  ],
);
