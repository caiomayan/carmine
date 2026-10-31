import './zod-jitless.js';
import { z } from 'zod';
import { ANALYTICS_ROUTES } from './analytics-routes.js';

/**
 * Os eventos de analytics de produto (A1, ADR 0021). O **plano de eventos** (`docs/analytics/plano-de-eventos.md`) é
 * a fonte única dos nomes, de quando disparam e das propriedades; este arquivo é o plano em código: a lista fechada de
 * eventos e o schema de cada um. É a única forma de emitir um evento: uma propriedade fora do schema é descartada,
 * e um teste confere que os nomes daqui são exatamente os da tabela do plano (mudar um sem o outro quebra a CI).
 *
 * Só a API usa (subpath `@carmine/contracts/analytics`, fora do índice): o navegador manda um evento só, `pagina_vista`,
 * pela biblioteca do PostHog, e não carrega nada daqui além da lista de rotas.
 */

/** Versão do plano quando o evento sai (`MAJOR.MINOR` do título do plano; o PATCH não muda o que sai). */
export const ANALYTICS_PLAN_VERSION = '1.0';

/** `producao` ou `staging`: separa os eventos da homologação dos de verdade. */
export const analyticsEnvironmentSchema = z.enum(['producao', 'staging']);
export type AnalyticsEnvironment = z.infer<typeof analyticsEnvironmentSchema>;

export { ANALYTICS_ROUTES, type AnalyticsRoute, analyticsRouteOf } from './analytics-routes.js';

export const analyticsRouteSchema = z.enum(ANALYTICS_ROUTES);

const modo = z.enum(['retake', 'deathmatch']);
/** O tipo de Item como o plano o nomeia (`INVENTORY_ITEM_TYPES` do contrato do Inventário). */
const tipo = z.enum(['arma', 'faca', 'luvas', 'agente', 'music_kit']);
const lados = z.enum(['ct', 'tr', 'ambos', 'nenhum']);
const contagem = z.int().nonnegative();
const bool = z.boolean();
/** Um código estável de recusa do contrato (`inventory_full`, `too_soon`...): minúsculas e sublinhado. */
const codigo = z.string().regex(/^[a-z0-9_-]{1,60}$/);
const pacote = z.enum(['1_mes', '3_meses', '6_meses']);
const meio = z.enum(['pix', 'cartao']);
const utm = z
  .string()
  .regex(/^[a-z0-9_-]{1,40}$/)
  .nullable();

/** As propriedades do Item que o Inventário mede (`item_adicionado` e `item_editado`). */
const itemBase = {
  tipo,
  item_id: contagem,
  exclusivo_vip: bool,
  tem_stattrak: bool,
  tem_nametag: bool,
  qtd_stickers: z.int().min(0).max(5),
  tem_charm: bool,
};

const vipCompra = { pacote, meio, valor_centavos: contagem };

/**
 * Cada evento: `account` (leva o `distinct_id` da Conta) ou `anonymous` (sai sem identidade e sem perfil de pessoa),
 * e as propriedades. Nenhuma é opcional por omissão: o que não se sabe vai como `null`.
 */
export const ANALYTICS_EVENTS = {
  pagina_vista: {
    identity: 'anonymous',
    origin: 'web',
    properties: z.object({
      rota: analyticsRouteSchema,
      modo: modo.nullable(),
      logado: bool,
      referenciador: z.string().max(80),
      utm_source: utm,
      utm_medium: utm,
      utm_campaign: utm,
    }),
  },
  login_iniciado: {
    identity: 'anonymous',
    origin: 'api',
    properties: z.object({ destino: analyticsRouteSchema }),
  },
  login_concluido: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      primeiro_login: bool,
      jogou_antes: bool,
      conta_criada_no_login: bool,
      dias_desde_primeiro_connect: contagem.nullable(),
      destino: analyticsRouteSchema,
    }),
  },
  login_falhou: {
    identity: 'anonymous',
    origin: 'api',
    properties: z.object({ motivo: z.enum(['cancelado', 'invalido', 'indisponivel', 'limite']) }),
  },
  conta_criada: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ origem: z.enum(['jogo', 'site']), modo: modo.nullable() }),
  },
  item_adicionado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ ...itemBase, total_apos: contagem }),
  },
  item_editado: { identity: 'account', origin: 'api', properties: z.object(itemBase) },
  item_removido: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ tipo, item_id: contagem, em_uso: bool, total_apos: contagem }),
  },
  item_restaurado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ segundos_ate_desfazer: contagem }),
  },
  item_recusado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      motivo: codigo,
      operacao: z.enum(['adicionar', 'editar', 'restaurar']),
    }),
  },
  recurso_vip_bloqueado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      recurso: z.enum([
        'agente',
        'music_kit',
        'stattrak',
        'nametag',
        'preset_extra',
        'preset_somente_leitura',
      ]),
      origem: z.enum(['inventario', 'loadout']),
    }),
  },
  item_equipado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      tipo,
      item_id: contagem,
      slot: z.string().max(40),
      lados,
      substituiu: bool,
      preset_ativo: bool,
      preset_principal: bool,
    }),
  },
  item_desequipado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ slot: z.string().max(40), lados, preset_ativo: bool }),
  },
  equipar_desfeito: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ slots_afetados: z.int().min(1) }),
  },
  preset_criado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ copiado_do_atual: bool, total_presets_apos: contagem }),
  },
  preset_ativado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ total_presets: contagem }),
  },
  preset_apagado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ era_ativo: bool, total_presets_apos: contagem }),
  },
  servidor_conectado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      modo,
      servidor_codigo: z.string().max(40).nullable(),
      primeiro_connect: bool,
      eh_vip: bool,
      conta_reivindicada: bool,
      itens_equipados: contagem,
      reenvio: bool,
    }),
  },
  sessao_de_jogo_encerrada: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ modo, duracao_segundos: z.int().min(1).max(86_400) }),
  },
  nome_exibicao_alterado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ primeira_troca: bool }),
  },
  nome_exibicao_revertido: { identity: 'account', origin: 'api', properties: z.object({}) },
  nome_exibicao_recusado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      motivo: z.enum([
        'too_short',
        'too_long',
        'invalid_chars',
        'offensive',
        'too_soon',
        'not_claimed',
      ]),
    }),
  },
  perfil_privado_alterado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ privado: bool }),
  },
  denuncia_enviada: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      motivo: z.enum(['cheat', 'voice', 'offensive_chat', 'griefing', 'other']),
      modo,
    }),
  },
  denuncia_recusada: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ recusa: z.enum(['same_target_cooldown', 'hourly_limit']), modo }),
  },
  discord_vinculo_iniciado: { identity: 'account', origin: 'api', properties: z.object({}) },
  discord_vinculado: { identity: 'account', origin: 'api', properties: z.object({}) },
  discord_vinculo_falhou: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      resultado: z.enum(['em-uso', 'conta-ja-vinculada', 'cancelado', 'invalido', 'indisponivel']),
    }),
  },
  discord_desvinculado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({ dias_vinculado: contagem }),
  },
  // VIP (S14): os nomes e as propriedades já estão fixos; só disparam quando o pagamento existir.
  vip_compra_iniciada: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      ...vipCompra,
      renovacao: bool,
      ja_foi_vip: bool,
      presente: bool,
    }),
  },
  vip_pago: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      ...vipCompra,
      renovacao: bool,
      ja_foi_vip: bool,
      presente: bool,
      dias_concedidos: z.union([z.literal(30), z.literal(90), z.literal(180)]),
      segundos_ate_pagar: contagem,
    }),
  },
  vip_pagamento_recusado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      ...vipCompra,
      categoria: z.enum(['recusado_pelo_emissor', 'dados_invalidos', 'outro']),
    }),
  },
  vip_pagamento_expirado: { identity: 'account', origin: 'api', properties: z.object(vipCompra) },
  vip_reembolsado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      ...vipCompra,
      dias_removidos: contagem,
      dias_desde_pagamento: contagem,
      motivo: z.enum(['arrependimento_7_dias', 'indisponibilidade', 'outro']),
    }),
  },
  vip_expirado: {
    identity: 'account',
    origin: 'api',
    properties: z.object({
      origem_vip: z.enum(['compra', 'concessao']),
      dias_ativo_total: contagem,
    }),
  },
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;
export const ANALYTICS_EVENT_NAMES = Object.keys(ANALYTICS_EVENTS) as AnalyticsEventName[];

/** As propriedades de um evento, como o código as passa. */
export type AnalyticsProps<N extends AnalyticsEventName> = z.infer<
  (typeof ANALYTICS_EVENTS)[N]['properties']
>;

/** Os nomes que o plano proíbe como propriedade, em qualquer evento (seção 1.2 do plano). */
export const ANALYTICS_FORBIDDEN_PROPERTY =
  /(^|_)(steam|steamid|public_?id|id_publico|nome|ip|user_?agent|texto|chat|cpf|email|avatar|url|discord_?id)(_|$)/;

/**
 * O `distinct_id` do PostHog de uma Conta é o `accounts.id` (UUID aleatório interno), nunca o SteamID64 nem o ID
 * público (ADR 0021). Fixo aqui para o teste e a API concordarem.
 */
export const ANALYTICS_UUID_NAMESPACE = 'b1d2c8f4-5a37-4d1e-9c60-7e2f3a9b4d85';

/** A chave "Participar da análise de uso" (direito de oposição, ADR 0021): `GET` e `PUT /api/me/analytics`. */
export const analyticsPreferenceSchema = z
  .object({
    /** A Conta participa da análise de uso (padrão: sim). */
    participate: z.boolean(),
    /** A análise está ligada neste ambiente; desligada, o web não mostra a chave. */
    enabled: z.boolean(),
  })
  .meta({ id: 'AnalyticsPreference' });

export type AnalyticsPreference = z.infer<typeof analyticsPreferenceSchema>;

export const analyticsPreferenceInputSchema = z
  .object({ participate: z.boolean() })
  .meta({ id: 'AnalyticsPreferenceInput' });

export type AnalyticsPreferenceInput = z.infer<typeof analyticsPreferenceInputSchema>;
