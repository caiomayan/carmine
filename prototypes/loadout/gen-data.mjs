// Gera os dados reais do protótipo do Loadout (armas, times, nomes PT-BR e imagens da CDN) a partir
// da @ianlucas/cs2-lib e grava no bloco <script id="data"> de variacao-a.html e variacao-b.html.
//
//   node prototypes/loadout/gen-data.mjs [caminho/da/cs2-lib/dist]
//
// Sem argumento, procura a lib no node_modules do repositório principal (pnpm). Os slots seguem
// `apps/api/src/catalog/catalog.ts` (só armas com skin); a ordem dentro da coluna é a do menu do CS2.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist =
  process.argv[2] ??
  join(
    here,
    '../../../carmine/node_modules/.pnpm/@ianlucas+cs2-lib@9.5.0/node_modules/@ianlucas/cs2-lib/dist',
  );
const lib = await import(pathToFileURL(join(dist, 'index.mjs')).href);
const { brazilian } = await import(pathToFileURL(join(dist, 'translations/brazilian.mjs')).href);
const { CS2Economy, CS2_ITEMS } = lib;
CS2Economy.load({ items: CS2_ITEMS, language: brazilian });

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const all = CS2Economy.itemsAsArray;
const SIDE_OF = { 2: 't', 3: 'ct' };
const sidesOf = (item) => (item.teams ?? []).map((t) => SIDE_OF[t]).filter(Boolean);

const RARITY = {
  '#ded6cc': 'consumer',
  '#b0c3d9': 'consumer',
  '#5e98d9': 'industrial',
  '#4b69ff': 'milspec',
  '#8847ff': 'restricted',
  '#d32ce6': 'classified',
  '#eb4b4b': 'covert',
  '#e4ae39': 'contraband',
};

// Ordem do menu de compra do CS2 dentro de cada categoria.
const ORDER = {
  secondary: [
    'glock', 'hkp2000', 'usp_silencer', 'elite', 'p250', 'tec9', 'fiveseven', 'cz75a', 'deagle',
    'revolver',
  ],
  smg: ['mac10', 'mp9', 'mp7', 'mp5sd', 'ump45', 'bizon', 'p90'],
  rifle: [
    'galilar', 'famas', 'ak47', 'm4a1', 'm4a1_silencer', 'ssg08', 'sg556', 'aug', 'awp', 'g3sg1',
    'scar20',
  ],
  heavy: ['nova', 'xm1014', 'mag7', 'sawedoff', 'm249', 'negev'],
  equipment: ['taser'],
};

const skinned = new Set(
  all.filter((i) => i.type === 'weapon' && !i.isDefault).map((i) => i.modelKey),
);
const defaults = all.filter((i) => i.type === 'weapon' && i.isDefault && skinned.has(i.modelKey));
const byKey = new Map(defaults.map((i) => [i.modelKey, i]));

const slots = [];
for (const [group, keys] of Object.entries(ORDER)) {
  for (const key of keys) {
    const item = byKey.get(key);
    if (!item) throw new Error(`arma sem skin ou desconhecida: ${key}`);
    if (item.loadoutCategory !== group) throw new Error(`${key} mudou de categoria`);
    slots.push({
      slot: `weapon_${key}`,
      group,
      name: clean(item.name),
      sides: sidesOf(item),
      image: item.getImageUrl(),
    });
  }
}
const missing = defaults.filter((i) => !slots.some((s) => s.slot === `weapon_${i.modelKey}`));
if (missing.length) throw new Error(`armas fora da ordem: ${missing.map((i) => i.modelKey)}`);

// Faca, luvas e music kit padrão (por lado); o agente padrão depende do mapa, sem imagem.
const dflt = (pred) => all.find((i) => i.isDefault && pred(i));
const gear = {
  knife: {
    t: dflt((i) => i.type === 'melee' && i.teams?.includes(2)).getImageUrl(),
    ct: dflt((i) => i.type === 'melee' && i.teams?.includes(3)).getImageUrl(),
  },
  gloves: {
    t: dflt((i) => i.type === 'glove' && i.teams?.includes(2)).getImageUrl(),
    ct: dflt((i) => i.type === 'glove' && i.teams?.includes(3)).getImageUrl(),
  },
  musicKit: { all: dflt((i) => i.type === 'musickit').getImageUrl() },
};

// Itens de exemplo (todos reais do catálogo) para o Loadout de demonstração.
const pick = (id) => {
  const i = CS2Economy.getById(id);
  const parts = clean(i.name).split(' | ');
  const isGear = i.type === 'agent' || i.type === 'musickit';
  return {
    id,
    title: isGear ? (parts[1] ?? parts[0]) : parts[0],
    subtitle: isGear ? (parts[2] ?? null) : (parts[1] ?? null),
    rarity: RARITY[i.rarityColor] ?? 'consumer',
    image: i.getImageUrl(),
    sides: sidesOf(i),
  };
};
const items = Object.fromEntries(
  [
    171, 950, 67, 224, 306, 1327, 1715, 8621, 1781, 1125, 1089, 882, 11428, 8630,
  ].map((id) => [id, pick(id)]),
);

const data = {
  slots,
  gear,
  items,
  rarities: {
    consumer: 'Nível Consumidor',
    industrial: 'Nível Industrial',
    milspec: 'Nível Militar',
    restricted: 'Restrito',
    classified: 'Confidencial',
    covert: 'Secreto',
    contraband: 'Contrabando',
  },
};
const json = JSON.stringify(data).replaceAll('<', '\\u003c');

for (const file of ['variacao-a.html', 'variacao-b.html']) {
  const path = join(here, file);
  let html;
  try {
    html = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  const next = html.replace(
    /(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/,
    () => `<script id="data" type="application/json">${json}</script>`,
  );
  if (next === html && !html.includes(json)) throw new Error(`${file}: bloco #data não encontrado`);
  writeFileSync(path, next);
  console.log(`${file}: ${slots.length} armas`);
}
