import type { Cs2Item } from '@carmine/contracts';
import type { CS2EconomyItem } from '@ianlucas/cs2-lib';
import type { Catalog } from '../catalog/catalog.js';
import type { ItemRules } from '../inventory/item-rules.js';
import { between, pick, type Random, seeded } from './demo-random.js';

/** `definitionIndex` das armas que a demonstração veste (o catálogo da cs2-lib). */
const AK_47 = 7;
const AWP = 9;
const M4A4 = 16;
const M4A1_S = 60;
const DESERT_EAGLE = 1;
const USP_S = 61;
const GLOCK = 4;
const FIVE_SEVEN = 3;
const P250 = 36;

const FREE_WEAPONS = [AK_47, AWP, USP_S, DESERT_EAGLE] as const;
const VIP_WEAPONS = [M4A1_S, M4A4, GLOCK, FIVE_SEVEN, P250] as const;

/**
 * Os Itens de uma Conta da demonstração, escolhidos no catálogo da cs2-lib com uma semente fixa e
 * conferidos pelas mesmas regras do Inventário (`ItemRules`): o que não passa é descartado, então
 * uma atualização do catálogo nunca quebra o seed. `vip` acrescenta o que só o VIP tem (agentes,
 * music kit e StatTrak) e mais armas.
 */
export function demoWardrobe(
  catalog: Catalog,
  rules: ItemRules,
  seed: string,
  vip: boolean,
): Cs2Item[] {
  const random = seeded(`guarda-roupa:${seed}`);
  const all = catalog.economy.itemsAsArray;
  const items: Cs2Item[] = [];
  const add = (item: Cs2Item | null) => {
    if (item) items.push(item);
  };

  for (const def of vip ? [...FREE_WEAPONS, ...VIP_WEAPONS] : FREE_WEAPONS) {
    add(
      build(
        rules,
        random,
        all.filter((i) => i.type === 'weapon' && !i.isDefault && i.definitionIndex === def),
        vip,
      ),
    );
  }
  add(
    build(
      rules,
      random,
      all.filter((i) => i.type === 'melee' && !i.isDefault),
      vip,
    ),
  );
  if (vip) {
    add(
      build(
        rules,
        random,
        all.filter((i) => i.type === 'glove' && !i.isDefault),
        vip,
      ),
    );
    const agents = all.filter((i) => i.type === 'agent' && !i.isDefault);
    const first = build(rules, random, agents, vip);
    add(first);
    const firstTeam = first ? catalog.find(first.id)?.team : undefined;
    add(
      build(
        rules,
        random,
        agents.filter((i) => i.team !== firstTeam),
        vip,
      ),
    );
    add(
      build(
        rules,
        random,
        all.filter((i) => i.type === 'musickit' && !i.isDefault),
        vip,
      ),
    );
  }
  return items;
}

/** O primeiro candidato sorteado que as regras do Inventário aceitam (até 30 tentativas). */
function build(
  rules: ItemRules,
  random: Random,
  candidates: readonly CS2EconomyItem[],
  vip: boolean,
): Cs2Item | null {
  if (candidates.length === 0) return null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = pick(random, candidates);
    for (const item of variants(candidate, random, vip)) {
      if (rules.check(item, { vip }) === null) return item;
    }
  }
  return null;
}

/** Do mais enfeitado (float, seed, StatTrak) ao simples: faca, agente e music kit não têm float. */
function* variants(item: CS2EconomyItem, random: Random, vip: boolean): Generator<Cs2Item> {
  const decorated: Cs2Item = { id: item.id };
  if (item.hasWear()) {
    const wear = between(random, item.getMinimumWear(), item.getMaximumWear());
    decorated.wear = Math.round(wear * 1e6) / 1e6;
  }
  if (item.hasSeed()) {
    decorated.seed = Math.round(
      between(random, item.getMinimumSeed(), item.getMaximumSeed() + 0.999),
    );
  }
  if (vip && item.hasStatTrak() && random() < 0.45) decorated.statTrak = 0;
  yield decorated;
  const { statTrak: _statTrak, ...withoutStatTrak } = decorated;
  yield withoutStatTrak;
  yield { id: item.id };
}
