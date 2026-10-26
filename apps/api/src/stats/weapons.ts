import { STAT_WEAPONS, type StatWeapon } from '@carmine/contracts';

const KNOWN: ReadonlySet<string> = new Set(STAT_WEAPONS);

/** Nomes do jogo que são outro nome da mesma arma, ou de uma família que vira uma chave só. */
const ALIASES: Readonly<Record<string, StatWeapon>> = {
  hkp2000: 'p2000',
  sg553: 'sg556',
  inferno: 'molotov',
  incgrenade: 'molotov',
  // O jogo manda a faca pelo nome do modelo em alguns casos (`bayonet`, `knife_karambit`...).
  bayonet: 'knife',
  knifegg: 'knife',
};

/**
 * O nome da arma que o plugin manda no `KillEvent` (o do jogo, até 64 caracteres) vira uma das
 * {@link STAT_WEAPONS}: minúsculas, sem `weapon_`, e qualquer `knife*` é `knife`. O que não está na
 * lista vira `other`, então um nome torto do plugin (ou uma arma nova do jogo) não cria linhas sem
 * fim em `account_weapon_stats`.
 */
export function normalizeWeapon(raw: string): StatWeapon {
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/^weapon_/, '');
  if (name.startsWith('knife')) return 'knife';
  const alias = ALIASES[name];
  if (alias) return alias;
  return KNOWN.has(name) ? (name as StatWeapon) : 'other';
}
