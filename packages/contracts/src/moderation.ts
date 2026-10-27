import './zod-jitless.js';
import { z } from 'zod';
import { isLastingSanction } from './rules.js';
import { steamId64Schema } from './steam.js';

/**
 * Contratos das Punições (S07): tipos, Categorias de infração, a tabela de reincidência que
 * sugere a Punição à Staff, o que o Perfil público mostra e o que o Carmine.Core aplica no jogo.
 *
 * Uma Punição vale em todos os Servidores Carmine. Ban, mute e gag duram até `endsAt` (nulo:
 * permanente) e expiram sozinhos; kick e aviso são instantâneos. O motivo livre é interno da
 * Staff: nunca sai no Perfil nem no jogo, que mostram só a Categoria de infração.
 */

/**
 * - `ban`: não entra nos Servidores Carmine e perde as sessões do site;
 * - `mute`: sem voz no jogo;
 * - `gag`: sem chat no jogo;
 * - `kick`: tirado do servidor uma vez (pode voltar na hora);
 * - `warning` (aviso): registrado e mostrado ao jogador; não restringe nada.
 */
export const sanctionTypeSchema = z
  .enum(['ban', 'mute', 'gag', 'kick', 'warning'])
  .meta({ id: 'SanctionType' });

export type SanctionType = z.infer<typeof sanctionTypeSchema>;

export {
  isLastingSanction,
  LASTING_SANCTION_TYPES,
  type LastingSanctionType,
} from './rules.js';

/**
 * Categoria de infração (`SanctionCategory`), da tabela de conduta do dono (2026-10-12):
 * - `offensive_chat`: ofensa pessoal repetida e direcionada no chat (trash talk e palavrão são
 *   liberados);
 * - `offensive_voice`: o mesmo na voz (só com gravação enviada ao suporte);
 * - `griefing`: griefing, AFK proposital ou TK proposital;
 * - `exploit`: abuso de bug ou exploit;
 * - `discrimination`: racismo, homofobia, xenofobia, misoginia (tolerância zero);
 * - `cheat`: cheat comprovado pela Staff;
 * - `threat`: ameaça;
 * - `doxxing`: exposição de dados pessoais;
 * - `ban_evasion`: conta alternativa para fugir de ban.
 */
export const sanctionCategorySchema = z
  .enum([
    'offensive_chat',
    'offensive_voice',
    'griefing',
    'exploit',
    'discrimination',
    'cheat',
    'threat',
    'doxxing',
    'ban_evasion',
  ])
  .meta({ id: 'SanctionCategory' });

export type SanctionCategory = z.infer<typeof sanctionCategorySchema>;

/**
 * Nome genérico da Categoria, o que o jogador vê no jogo e no Perfil público (o web pode ter os
 * seus no i18n; a API usa estes nas mensagens do jogo).
 */
export const SANCTION_CATEGORY_LABELS: Record<SanctionCategory, string> = {
  offensive_chat: 'Conduta no chat',
  offensive_voice: 'Conduta na voz',
  griefing: 'Griefing',
  exploit: 'Abuso de bug',
  discrimination: 'Discriminação',
  cheat: 'Cheat',
  threat: 'Ameaça',
  doxxing: 'Exposição de dados pessoais',
  ban_evasion: 'Fuga de ban',
};

/**
 * Categoria como o Perfil público a mostra: a da Punição, menos `cheat` sem evidência anexada, que
 * aparece como `rule_violation` ("Violação das regras"). Decisão do dono (2026-10-13): o selo
 * público "Cheat" só com evidência; um ban apoiado só em testemunha não afirma cheat em público.
 */
export const publicSanctionCategorySchema = z
  .enum([...sanctionCategorySchema.options, 'rule_violation'])
  .meta({ id: 'PublicSanctionCategory' });

export type PublicSanctionCategory = z.infer<typeof publicSanctionCategorySchema>;

/**
 * Prova de um ban por cheat (decisão do dono, 2026-10-13): uma testemunha mencionada (alguém da
 * plataforma ou não, em texto livre: nome, ID público, Discord) e/ou um link para a evidência
 * (vídeo, demo, print). Ao menos uma das duas; o Perfil público só diz "Cheat" com evidência.
 */
export const sanctionWitnessSchema = z.string().trim().min(2).max(200);

export const sanctionEvidenceUrlSchema = z
  .url({ protocol: /^https?$/, error: 'use um link http(s)' })
  .max(500);

/** Ban por cheat: exige testemunha ou evidência (ver {@link sanctionWitnessSchema}). */
export function requiresCheatProof(
  category: SanctionCategory,
  measures: readonly { type: SanctionType }[],
): boolean {
  return category === 'cheat' && measures.some((m) => m.type === 'ban');
}

/** Duração máxima de uma Punição temporária: 1 ano (mais que isso, permanente). */
export const SANCTION_MAX_DURATION_MINUTES = 365 * 24 * 60;

/**
 * Uma medida: o tipo e quanto dura. `durationMinutes` nulo é permanente; kick e aviso não têm
 * duração (sempre nulo).
 */
export const sanctionMeasureSchema = z
  .strictObject({
    type: sanctionTypeSchema,
    durationMinutes: z.int().min(1).max(SANCTION_MAX_DURATION_MINUTES).nullable(),
  })
  .refine((m) => isLastingSanction(m.type) || m.durationMinutes === null, {
    message: 'kick e aviso não têm duração',
    path: ['durationMinutes'],
  })
  .meta({ id: 'SanctionMeasure' });

export type SanctionMeasure = z.infer<typeof sanctionMeasureSchema>;

/** Janela da reincidência: só contam as ocorrências da mesma Categoria nos últimos 30 dias. */
export const RECIDIVISM_WINDOW_DAYS = 30;

const HOUR = 60;
const DAY = 24 * HOUR;
const m = (type: SanctionType, durationMinutes: number | null = null): SanctionMeasure => ({
  type,
  durationMinutes,
});

/**
 * Tabela de reincidência do dono: por Categoria, as medidas da 1ª, 2ª, 3ª e 4ª+ ocorrência na
 * janela de {@link RECIDIVISM_WINDOW_DAYS} dias. A última linha vale dali em diante.
 */
export const RECIDIVISM_TABLE: Record<SanctionCategory, SanctionMeasure[][]> = {
  offensive_chat: [[m('warning')], [m('gag', HOUR)], [m('gag', DAY)], [m('gag', 7 * DAY)]],
  offensive_voice: [[m('warning')], [m('mute', HOUR)], [m('mute', DAY)], [m('mute', 7 * DAY)]],
  griefing: [[m('kick')], [m('ban', DAY)], [m('ban', 7 * DAY)], [m('ban', 30 * DAY)]],
  exploit: [[m('ban', DAY)], [m('ban', 7 * DAY)], [m('ban', 30 * DAY)], [m('ban')]],
  discrimination: [[m('gag', 7 * DAY), m('ban', DAY)], [m('ban', 30 * DAY)], [m('ban')]],
  cheat: [[m('ban')]],
  threat: [[m('ban')]],
  doxxing: [[m('ban')]],
  ban_evasion: [[m('ban')]],
};

/**
 * A Punição sugerida pela tabela para a próxima ocorrência da Categoria, dado quantas ocorrências
 * dela a Conta já teve na janela. A Staff confirma ou ajusta; o sistema nunca aplica sozinho.
 */
export function suggestSanction(
  category: SanctionCategory,
  previousOffenses: number,
): { offense: number; measures: SanctionMeasure[] } {
  const steps = RECIDIVISM_TABLE[category];
  const index = Math.min(Math.max(0, Math.floor(previousOffenses)), steps.length - 1);
  return { offense: previousOffenses + 1, measures: steps[index] ?? [] };
}

/** A sugestão da tabela para uma Categoria, no painel da Staff. */
export const sanctionSuggestionSchema = z
  .object({
    category: sanctionCategorySchema,
    /** Ocorrências da Categoria na janela de 30 dias (sem as removidas por recurso aceito). */
    previousOffenses: z.int().min(0),
    /** Qual ocorrência seria esta (1ª, 2ª...). */
    offense: z.int().min(1),
    measures: z.array(sanctionMeasureSchema).min(1),
  })
  .meta({ id: 'SanctionSuggestion' });

export type SanctionSuggestion = z.infer<typeof sanctionSuggestionSchema>;

/**
 * Uma Punição como o Perfil público mostra: tipo, Categoria genérica, data e duração; nunca o
 * motivo livre, quem aplicou, a testemunha nem o link da evidência. `endsAt` é o fim efetivo
 * (antecipado se a Staff revogou); nulo em ban/mute/gag é permanente e, em kick e aviso, é sempre
 * nulo.
 */
export const publicSanctionSchema = z
  .object({
    id: z.uuid(),
    type: sanctionTypeSchema,
    /** Cheat sem evidência anexada sai como `rule_violation`. */
    category: publicSanctionCategorySchema,
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    /** A Staff encerrou antes da hora (não por recurso aceito: esse some do Perfil). */
    revoked: z.boolean(),
  })
  .meta({ id: 'PublicSanction' });

export type PublicSanction = z.infer<typeof publicSanctionSchema>;

/**
 * Uma Punição valendo agora, como a própria Conta a vê em `GET /api/me` (S07): com o motivo
 * escrito pela Staff, que só a pessoa punida vê (nunca sai no Perfil público).
 */
export const ownSanctionSchema = z
  .object({
    id: z.uuid(),
    type: sanctionTypeSchema,
    category: sanctionCategorySchema,
    reason: z.string().min(1),
    startsAt: z.iso.datetime({ offset: true }),
    /** Nulo: permanente. */
    endsAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'OwnSanction' });

export type OwnSanction = z.infer<typeof ownSanctionSchema>;

/** Meses de histórico de Punições no Perfil público (o ban permanente por cheat fica sempre). */
export const PROFILE_SANCTION_HISTORY_MONTHS = 12;

/**
 * Punições no Perfil público (S07). Não há lista pública de banidos: só o Perfil de cada Conta.
 * - `active`: as Punições valendo agora (ban, mute, gag), para o selo ("Banido até 20/10");
 * - `history`: os últimos {@link PROFILE_SANCTION_HISTORY_MONTHS} meses, sem avisos, da mais
 *   recente para a mais antiga (inclui as ativas), mais o ban permanente por cheat de qualquer
 *   época. Só para quem está logado no site (decisão do dono, 2026-10-13): nulo para o visitante
 *   sem sessão, que vê só o selo das ativas.
 * O Perfil privado não esconde Punições; um recurso aceito remove a Punição das duas listas.
 */
export const profileSanctionsSchema = z
  .object({
    active: z.array(publicSanctionSchema),
    history: z.array(publicSanctionSchema).nullable(),
  })
  .meta({ id: 'ProfileSanctions' });

export type ProfileSanctions = z.infer<typeof profileSanctionsSchema>;

export { APPEAL_PATH, APPEAL_RESPONSE_HOURS } from './rules.js';

/**
 * Uma Punição para o Carmine.Core aplicar. Ban, mute e gag vêm enquanto valem (o plugin também
 * as solta sozinho em `endsAt`); kick e aviso vêm por {@link GAME_INSTANT_SANCTION_SECONDS} s
 * depois de aplicados, e o plugin os executa uma vez só por `id`. `message` é o texto pronto
 * para o jogador (Categoria, duração e como recorrer, em PT-BR), nunca o motivo livre.
 */
export const gameSanctionSchema = z
  .object({
    id: z.uuid(),
    steamId: steamId64Schema,
    type: sanctionTypeSchema,
    category: sanctionCategorySchema,
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    message: z.string().min(1),
  })
  .meta({ id: 'GameSanction' });

export type GameSanction = z.infer<typeof gameSanctionSchema>;

/** Por quanto tempo um kick ou aviso continua indo nos batimentos depois de aplicado. */
export const GAME_INSTANT_SANCTION_SECONDS = 60;
