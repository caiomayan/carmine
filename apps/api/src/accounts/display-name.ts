import {
  DISPLAY_NAME_COOLDOWN_DAYS,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
} from '@carmine/contracts';
import { isOffensiveName } from './name-filter.js';
import { placeholderNameFor } from './placeholder-names.js';

/** Limite de caracteres de um nome Steam. */
const MAX_LENGTH = 32;

/**
 * Nome de exibição de uma Conta (ADR 0008). Com nome próprio (S11), vale ele; sem, segue o nome
 * Steam. Se o nome Steam for ofensivo ou vazio, a Conta aparece com um nome fictício fixo
 * (`placeholderNameFor`, nunca o `#ID`) até ter um nome aceitável. Depois de um reset da Staff
 * (S07), o nome Steam resetado (`blockedSteamName`) também vira esse nome fictício, até a pessoa
 * trocar de nome na Steam. Um nome próprio que o filtro
 * (ampliado depois) passou a reprovar também cai para o nome Steam. O nome Steam também perde
 * `<>&{}` (o nome próprio os recusa): o nome vai para o placar e o chat do jogo.
 */
export function displayNameFor(
  steamName: string,
  publicId: number,
  blockedSteamName: string | null = null,
  customName: string | null = null,
): string {
  if (customName !== null && !isOffensiveName(customName)) {
    return customName;
  }
  if (blockedSteamName !== null && steamName === blockedSteamName) {
    return placeholderNameFor(publicId);
  }
  const cleaned = [
    ...steamName
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .replace(MARKUP_CHARS, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
    .slice(0, MAX_LENGTH)
    .join('')
    .trim();
  if (cleaned === '' || isOffensiveName(cleaned)) {
    return placeholderNameFor(publicId);
  }
  return cleaned;
}

export type DisplayNameRejection = 'too_short' | 'too_long' | 'invalid_chars' | 'offensive';

/** Controle, formato (zero-width, bidi, BOM), uso privado, surrogates soltos e não atribuídos. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}]/gu;
/** Letras e símbolos em branco que se passam por espaço: Hangul filler, braille vazio. */
const BLANK_GLYPHS = /[\u{115F}\u{1160}\u{17B4}\u{17B5}\u{2800}\u{3164}\u{FFA0}]/gu;
/** Marcação que pode virar HTML no placar ou token de cor num plugin de chat. */
const MARKUP = /[<>&{}]/u;
const MARKUP_CHARS = /[<>&{}]/gu;
/** Acentos empilhados além do que qualquer língua usa. */
const STACKED_MARKS = /\p{M}{4,}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Normaliza o nome que a pessoa digitou: NFC, espaços colapsados (inclusive NBSP e ideográfico),
 * sem caracteres de controle ou invisíveis, aparado. Então confere o tamanho (em pontos de
 * código), a segurança para o jogo (sem `<>&{}`, sem acentos empilhados, ao menos uma letra ou
 * número) e o filtro de palavras ofensivas. A mesma entrada serve ao nome que vai para o placar,
 * o chat e o kill feed, por isso a cautela com marcação.
 */
export function normalizeDisplayName(
  raw: string,
): { ok: true; name: string } | { ok: false; reason: DisplayNameRejection } {
  const name = raw
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(INVISIBLE, '')
    .replace(BLANK_GLYPHS, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const length = [...name].length;
  if (length < DISPLAY_NAME_MIN_LENGTH) return { ok: false, reason: 'too_short' };
  if (length > DISPLAY_NAME_MAX_LENGTH) return { ok: false, reason: 'too_long' };
  if (MARKUP.test(name) || STACKED_MARKS.test(name) || !LETTER_OR_DIGIT.test(name)) {
    return { ok: false, reason: 'invalid_chars' };
  }
  if (isOffensiveName(name)) return { ok: false, reason: 'offensive' };
  return { ok: true, name };
}

/**
 * Quando a Conta pode trocar o nome de novo (`DISPLAY_NAME_COOLDOWN_DAYS` dias depois da última
 * troca), ou `null` se já pode. O prazo conta da última troca da pessoa ou do reset da Staff.
 */
export function nextDisplayNameChange(changedAt: Date | null, now: Date): Date | null {
  if (changedAt === null) return null;
  const free = displayNameCooldownEnd(changedAt);
  return free.getTime() > now.getTime() ? free : null;
}

/** O fim do prazo de uma troca (ou reset) feita em `changedAt`. */
export function displayNameCooldownEnd(changedAt: Date): Date {
  return new Date(changedAt.getTime() + DISPLAY_NAME_COOLDOWN_DAYS * 86_400_000);
}
