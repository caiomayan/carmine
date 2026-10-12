import { type Profile, type ShowcaseItem, steamProfileUrl } from '@carmine/contracts';
import type { Account } from './accounts.service.js';

/**
 * Perfil (`Profile`) público de uma Conta: só o que qualquer visitante pode ver. A vitrine é o
 * Loadout que vai para o jogo (`Loadouts.showcase`).
 */
export function toProfile(account: Account, showcase: ShowcaseItem[]): Profile {
  return {
    publicId: account.publicId,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    steamId: account.steamId,
    steamProfileUrl: steamProfileUrl(account.steamId),
    claimed: account.claimedAt !== null,
    loadoutShowcase: { items: showcase },
  };
}
