import './zod-jitless.js';
import { z } from 'zod';

/**
 * Contratos do vínculo com o Discord (S15). É só um vínculo, não um login: a Steam continua a
 * única autenticação (ADR 0007). As rotas de navegação (`/api/auth/discord/*`) respondem com
 * redirecionamentos para a página de origem com `?discord=<resultado>`.
 */

/** Parâmetro de busca com que o vínculo volta à página de origem. */
export const DISCORD_RESULT_PARAM = 'discord';

/**
 * Como terminou o vínculo:
 * - `vinculado`: o Discord foi ligado à Conta (e os cargos aplicados);
 * - `em-uso`: esse Discord já está ligado a outra Conta;
 * - `conta-ja-vinculada`: a Conta já tem outro Discord (desvincule antes);
 * - `cancelado`: a pessoa desistiu na tela do Discord;
 * - `invalido`: o fluxo expirou, já foi usado ou não é deste navegador/Conta;
 * - `indisponivel`: o Discord falhou;
 * - `desligado`: a integração não está configurada neste ambiente;
 * - `sem-sessao`: não havia sessão Steam ativa.
 */
export const discordLinkResultSchema = z
  .enum([
    'vinculado',
    'em-uso',
    'conta-ja-vinculada',
    'cancelado',
    'invalido',
    'indisponivel',
    'desligado',
    'sem-sessao',
  ])
  .meta({ id: 'DiscordLinkResult' });

export type DiscordLinkResult = z.infer<typeof discordLinkResultSchema>;

/** O vínculo da Conta da sessão (`GET /api/discord/link`). */
export const discordLinkStatusSchema = z
  .object({
    /** A integração está configurada; sem ela o botão fica desabilitado. */
    enabled: z.boolean(),
    /** O Discord ligado à Conta; nulo: não vinculado. */
    link: z.object({ username: z.string(), linkedAt: z.iso.datetime({ offset: true }) }).nullable(),
  })
  .meta({ id: 'DiscordLinkStatus' });

export type DiscordLinkStatus = z.infer<typeof discordLinkStatusSchema>;
