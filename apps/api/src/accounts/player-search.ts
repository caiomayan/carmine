import { PLAYER_SEARCH_LIMIT, type PlayerSearch } from '@carmine/contracts';
import { and, gt, isNull, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';

/** A busca do jogador já normalizada e os padrões do LIKE que saem dela. */
export interface PlayerSearchTerms {
  /** Minúsculas, sem acento e com um espaço só entre as palavras. */
  plain: string;
  /** O nome tem a busca em qualquer ponto. */
  contains: string;
  /** O nome começa com a busca. */
  prefix: string;
  /** Alguma palavra do nome (depois da primeira) começa com a busca. */
  wordPrefix: string;
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Prepara o texto digitado: a mesma normalização que `NAME_PLAIN` faz com o nome, no SQL. */
export function playerSearchTerms(query: string): PlayerSearchTerms {
  const plain = query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const escaped = escapeLike(plain);
  return {
    plain,
    contains: `%${escaped}%`,
    prefix: `${escaped}%`,
    wordPrefix: `% ${escaped}%`,
  };
}

const ACCENTED = 'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ';
const PLAIN = 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn';

/**
 * O Nome de exibição sem acento e em minúsculas, para casar com `playerSearchTerms`. A lista de
 * letras é a do português (e vizinhas): o Postgres não traz `unaccent` sem a extensão, e `translate`
 * é o que dispensa a migração.
 */
const NAME_PLAIN = sql`lower(translate(${accounts.displayName}, ${ACCENTED}, ${PLAIN}))`;

/**
 * Busca de jogadores pelo Nome de exibição (a paleta de comandos, U3d). Devolve só o que o Perfil
 * mostra a qualquer visitante: ID público (para o link), nome e avatar. O Perfil privado não
 * esconde o nome (só as Estatísticas), então entra; a Conta anonimizada, que já não tem Perfil,
 * fica de fora. Ordem: nome igual, começa com, começa uma palavra, contém; e, no empate, quem
 * jogou mais recentemente. Uma varredura da tabela por busca: o limite de requisições da rota e
 * o tamanho da base do MVP a seguram (um índice trigram resolve se a base crescer).
 */
export class PlayerSearcher {
  constructor(private readonly db: Database) {}

  async search(query: string): Promise<PlayerSearch> {
    const terms = playerSearchTerms(query);
    if (terms.plain === '') return { players: [] };
    const rank: SQL = sql`case
      when ${NAME_PLAIN} = ${terms.plain} then 0
      when ${NAME_PLAIN} like ${terms.prefix} then 1
      when ${NAME_PLAIN} like ${terms.wordPrefix} then 2
      else 3 end`;
    const rows = await this.db
      .select({
        publicId: accounts.publicId,
        displayName: accounts.displayName,
        avatarUrl: accounts.avatarUrl,
      })
      .from(accounts)
      .where(
        and(
          isNull(accounts.anonymizedAt),
          // Anonimizada com ban valendo já tem SteamID64 negativo; a checagem de cima basta, esta é o cinto.
          gt(accounts.steamId, 0n),
          sql`${NAME_PLAIN} like ${terms.contains}`,
        ),
      )
      .orderBy(rank, sql`${accounts.lastConnectedAt} desc nulls last`, accounts.publicId)
      .limit(PLAYER_SEARCH_LIMIT);
    return { players: rows };
  }
}
