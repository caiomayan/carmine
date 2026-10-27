import './zod-jitless.js';
import { z } from 'zod';
import { gameModeSchema, mapNameSchema } from './game-server.js';

/**
 * S12b · Estatísticas detalhadas do Perfil (docs/specs/s12b-contratos.md). Todos os endpoints daqui
 * seguem a regra das Estatísticas (`canSeeStats`, S11): num Perfil privado só a própria Conta vê; para
 * os outros `visible` é falso, as listas vêm vazias e `since` nulo.
 *
 * Os dados detalhados só existem desde que o plugin novo foi para os servidores (não há histórico para
 * trás): `since` é essa data (a da primeira linha da Conta), e `since` nulo com `visible` verdadeiro é
 * o estado "ainda não coletando". Os totais de sempre (kills, mortes...) continuam em `ProfileStats`.
 */

/** Um dia do calendário, `YYYY-MM-DD`, no horário de Brasília (-03:00 fixo, sem horário de verão). */
export const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .meta({ id: 'CalendarDay', example: '2026-10-26' });

export type CalendarDay = z.infer<typeof calendarDaySchema>;

// --- Atividade por dia (o mapa de calor) -----------------------------------------------------------

/** Quantas semanas o mapa de calor pede por padrão e no máximo (`?weeks=`). */
export const PROFILE_ACTIVITY_WEEKS_DEFAULT = 20;
export const PROFILE_ACTIVITY_WEEKS_MAX = 52;

/** Os dias de atividade somam os Modos. */
export const profileActivityDaySchema = z
  .object({
    day: calendarDaySchema,
    /** O calor do mapa é o tempo jogado: o Deathmatch quase não tem rounds. */
    secondsPlayed: z.int().nonnegative(),
    /** Rounds jogados (zero no Deathmatch, que pode nem ter `round_end`). */
    roundsPlayed: z.int().nonnegative(),
    kills: z.int().nonnegative(),
  })
  .meta({ id: 'ProfileActivityDay' });

export type ProfileActivityDay = z.infer<typeof profileActivityDaySchema>;

/**
 * `GET /api/profiles/{publicId}/stats/activity?weeks=20` (1 a 52): a atividade dos últimos `weeks`
 * semanas, só os dias com atividade, do mais antigo ao mais novo (o cliente preenche os zeros e
 * escolhe os níveis do calor). O dia vem da hora do evento, não da do recebimento.
 */
export const profileActivitySchema = z
  .object({
    visible: z.boolean(),
    since: calendarDaySchema.nullable(),
    days: z.array(profileActivityDaySchema).max(PROFILE_ACTIVITY_WEEKS_MAX * 7),
  })
  .meta({ id: 'ProfileActivity' });

export type ProfileActivity = z.infer<typeof profileActivitySchema>;

// --- Armas por lado (o radar) ----------------------------------------------------------------------

/**
 * As armas que o radar distingue: o nome cru do jogo (`ak47`, `hkp2000`, `knife_t`...) é normalizado
 * pela API para uma destas chaves (minúsculas, sem `weapon_`; todas as facas são `knife`; `hkp2000` é
 * `p2000`; `inferno` é `molotov`, que cobre a incendiária). O que não está na lista vira `other`, então
 * um nome torto do plugin não cria linhas sem fim. O web resolve o nome em PT-BR pelo catálogo da
 * cs2-lib; uma chave que ele não conheça deve ser tratada como `other`.
 */
export const STAT_WEAPONS = [
  'ak47',
  'm4a1',
  'm4a1_silencer',
  'famas',
  'galilar',
  'aug',
  'sg556',
  'awp',
  'ssg08',
  'scar20',
  'g3sg1',
  'mp9',
  'mac10',
  'mp7',
  'mp5sd',
  'ump45',
  'p90',
  'bizon',
  'nova',
  'xm1014',
  'mag7',
  'sawedoff',
  'm249',
  'negev',
  'glock',
  'p2000',
  'usp_silencer',
  'p250',
  'fiveseven',
  'tec9',
  'cz75a',
  'deagle',
  'elite',
  'revolver',
  'knife',
  'taser',
  'hegrenade',
  'molotov',
  'other',
] as const;

export const statWeaponSchema = z.enum(STAT_WEAPONS).meta({ id: 'StatWeapon' });

export type StatWeapon = z.infer<typeof statWeaponSchema>;

/** Quantas armas o radar pede por padrão e no máximo (`?limit=`). */
export const PROFILE_WEAPONS_LIMIT_DEFAULT = 8;
export const PROFILE_WEAPONS_LIMIT_MAX = 20;

/** `?mode=` do radar: um Modo ou os dois somados. */
export const weaponsModeSchema = z
  .enum(['retake', 'deathmatch', 'all'])
  .meta({ id: 'WeaponsMode' });

export type WeaponsMode = z.infer<typeof weaponsModeSchema>;

/**
 * Abates com uma arma, por lado do assassino. `kills` = `ct` + `t` (a kill sem lado, de plugin
 * antigo, não entra aqui). No Deathmatch o "lado" é só o time que o jogo deu a cada um: o cliente pode
 * mostrar só o total.
 */
export const profileWeaponSchema = z
  .object({
    weapon: statWeaponSchema,
    kills: z.int().nonnegative(),
    headshots: z.int().nonnegative(),
    ct: z.int().nonnegative(),
    t: z.int().nonnegative(),
  })
  .meta({ id: 'ProfileWeapon' });

export type ProfileWeapon = z.infer<typeof profileWeaponSchema>;

/**
 * `GET /api/profiles/{publicId}/stats/weapons?mode=all&limit=8`: as armas mais usadas "de sempre"
 * (sem série semanal), da com mais abates para a com menos; empate por nome da arma. `mode` devolve o
 * pedido (padrão `all`).
 */
export const profileWeaponsSchema = z
  .object({
    visible: z.boolean(),
    since: calendarDaySchema.nullable(),
    mode: weaponsModeSchema,
    weapons: z.array(profileWeaponSchema).max(PROFILE_WEAPONS_LIMIT_MAX),
  })
  .meta({ id: 'ProfileWeapons' });

export type ProfileWeapons = z.infer<typeof profileWeaponsSchema>;

// --- Sessões de jogo -------------------------------------------------------------------------------

/** Quantas Sessões o Perfil pede por padrão e no máximo (`?limit=`). */
export const PROFILE_SESSIONS_LIMIT_DEFAULT = 10;
export const PROFILE_SESSIONS_LIMIT_MAX = 30;

/**
 * Uma Sessão de jogo. Quem vê de fora (D1) só recebe Modo, mapa, dia e duração: nada de servidor nem
 * hora do relógio, que revelariam o hábito da pessoa. `startedAt` e `endedAt` só vêm para a própria
 * Conta (nulos para os outros). `live` (em andamento agora) só para a própria Conta e os amigos
 * Steam; para os outros é sempre falso.
 */
export const profileSessionSchema = z
  .object({
    id: z.uuid(),
    mode: gameModeSchema,
    /** O mapa em que a pessoa entrou; nulo se o plugin não disse. */
    map: mapNameSchema.nullable(),
    /** Os mapas por onde a Sessão passou, em ordem (o Deathmatch rotaciona); vazio se o plugin não disse. */
    maps: z.array(mapNameSchema).max(8),
    /** O dia do início, em Brasília. */
    day: calendarDaySchema,
    startedAt: z.iso.datetime({ offset: true }).nullable(),
    endedAt: z.iso.datetime({ offset: true }).nullable(),
    /** Fim − início; nulo enquanto `live` ou numa Sessão sem fim (queda do servidor). */
    seconds: z.int().nonnegative().nullable(),
    live: z.boolean(),
  })
  .meta({ id: 'ProfileSession' });

export type ProfileSession = z.infer<typeof profileSessionSchema>;

/**
 * `GET /api/profiles/{publicId}/sessions?limit=10`: as Sessões mais recentes, da mais nova para a
 * mais antiga (só as dos últimos 90 dias). Uma Sessão aberta há mais de 24 h sem presença some.
 */
export const profileSessionsSchema = z
  .object({
    visible: z.boolean(),
    since: calendarDaySchema.nullable(),
    sessions: z.array(profileSessionSchema).max(PROFILE_SESSIONS_LIMIT_MAX),
  })
  .meta({ id: 'ProfileSessions' });

export type ProfileSessions = z.infer<typeof profileSessionsSchema>;
