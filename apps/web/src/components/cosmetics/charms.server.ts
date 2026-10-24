import { searchAttachments } from '@/lib/catalog/catalog';
import type { CharmPick } from './catalog';

/** Mais raros primeiro: são os que a pessoa quer exibir. */
const ORDER = [
  'contraband',
  'covert',
  'classified',
  'restricted',
  'milspec',
  'industrial',
  'consumer',
];

/**
 * Os chaveiros que a Conta de exemplo "tem no Inventário": 12 do catálogo da cs2-lib (nome e imagem de
 * verdade), dos mais raros aos comuns, sem repetir a imagem. Só no servidor.
 */
export function demoCharms(count = 12): CharmPick[] {
  // Os chaveiros de verdade se chamam "Chaveiro | ..."; o resto do tipo são as placas de adesivo.
  const all = searchAttachments('charm', { q: 'Chaveiro', limit: 200 }).items.filter((entry) =>
    entry.name.startsWith('Chaveiro | '),
  );
  const seen = new Set<string>();
  const picks: CharmPick[] = [];
  for (const rarity of ORDER) {
    for (const entry of all) {
      if (entry.rarity !== rarity || !entry.image || seen.has(entry.image)) continue;
      seen.add(entry.image);
      picks.push({
        id: entry.id,
        name: entry.name.replace('Chaveiro | ', ''),
        image: entry.image,
      });
      if (picks.length >= count) return picks;
      // No máximo 3 de cada raridade: os 12 saem variados.
      if (picks.filter((pick) => all.find((e) => e.id === pick.id)?.rarity === rarity).length >= 3)
        break;
    }
  }
  return picks;
}
