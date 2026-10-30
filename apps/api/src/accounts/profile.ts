import {
  type Plan,
  type Profile,
  type ProfileSanctions,
  type ShowcaseItem,
  steamProfileUrl,
} from '@carmine/contracts';
import type { Account } from './accounts.service.js';

/**
 * Perfil (`Profile`) público de uma Conta: só o que qualquer visitante pode ver. A vitrine é o
 * Loadout que vai para o jogo (`Loadouts.showcase`); as Punições, as do Perfil público
 * (`Sanctions.profileOf`, S07). `vipActive` vira só o selo: o fim do Período é da própria Conta.
 */
export function toProfile(
  account: Account,
  showcase: ShowcaseItem[],
  sanctions: ProfileSanctions,
  vipActive: boolean,
  plan: Plan | null = null,
): Profile {
  return {
    publicId: account.publicId,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    steamId: account.steamId,
    steamProfileUrl: steamProfileUrl(account.steamId),
    claimed: account.claimedAt !== null,
    memberSince: account.createdAt.toISOString(),
    isVip: vipActive,
    plan,
    loadoutShowcase: { items: showcase },
    sanctions,
    isPrivate: account.profilePrivate,
  };
}
