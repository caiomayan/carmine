import { isOffensiveName } from './name-filter.js';

/** Limite de caracteres de um nome Steam. */
const MAX_LENGTH = 32;

/**
 * Nome de exibição de uma Conta a partir do nome Steam (ADR 0008). Enquanto não houver nome
 * próprio (S11), segue o nome Steam; se ele for ofensivo ou vazio, a Conta aparece como
 * "Jogador #ID" até ter um nome aceitável. Depois de um reset da Staff (S07), o nome Steam
 * resetado (`blockedSteamName`) também vira "Jogador #ID", até a pessoa trocar de nome na Steam.
 */
export function displayNameFor(
  steamName: string,
  publicId: number,
  blockedSteamName: string | null = null,
): string {
  if (blockedSteamName !== null && steamName === blockedSteamName) {
    return `Jogador #${publicId}`;
  }
  const cleaned = [
    ...steamName
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
    .slice(0, MAX_LENGTH)
    .join('')
    .trim();
  if (cleaned === '' || isOffensiveName(cleaned)) {
    return `Jogador #${publicId}`;
  }
  return cleaned;
}
