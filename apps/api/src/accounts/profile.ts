import { type Profile, steamProfileUrl } from '@carmine/contracts';
import type { Account } from './accounts.service.js';

/** Perfil (`Profile`) público de uma Conta: só o que qualquer visitante pode ver. */
export function toProfile(account: Account): Profile {
  return {
    publicId: account.publicId,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    steamId: account.steamId,
    steamProfileUrl: steamProfileUrl(account.steamId),
    claimed: account.claimedAt !== null,
    // Sem Loadout até a S05.
    loadoutShowcase: { items: [] },
  };
}
