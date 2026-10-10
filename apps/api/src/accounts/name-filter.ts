/**
 * Filtro de palavras ofensivas (PT-BR e EN) para nomes. É uma barreira contra o óbvio, não uma
 * moderação completa: normaliza acentos, largura total, letras cirílicas parecidas, leetspeak,
 * separadores e letras repetidas, e então procura os termos de duas formas:
 *
 * - `WHOLE_WORDS`: só a palavra inteira (evita reprovar "computador" por "puta" ou "enviado" por
 *   "viado");
 * - `ANYWHERE`: termos fortes o bastante para reprovar mesmo dentro de outra palavra
 *   ("xXcaralhoXx", "MotherFucker").
 */

const WHOLE_WORDS = new Set([
  // PT-BR
  'arrombado',
  'bicha',
  'boquete',
  'buceta',
  'caralho',
  'corno',
  'cu',
  'cuzao',
  'cuzinho',
  'estuprador',
  'fdp',
  'foda',
  'fodase',
  'foder',
  'fudido',
  'fuder',
  'merda',
  'mongol',
  'nazista',
  'otario',
  'pedofilo',
  'piroca',
  'porra',
  'pqp',
  'prostituta',
  'punheta',
  'puta',
  'putao',
  'putinha',
  'puto',
  'retardado',
  'sapatao',
  'siririca',
  'tnc',
  'vadia',
  'vagabunda',
  'viadinho',
  'viado',
  'vsf',
  'xereca',
  'xoxota',
  // EN
  'asshole',
  'bastard',
  'bitch',
  'cock',
  'cunt',
  'dick',
  'fag',
  'faggot',
  'fuck',
  'fucker',
  'fucking',
  'kys',
  'nazi',
  'nigga',
  'nigger',
  'pedo',
  'pussy',
  'rape',
  'rapist',
  'retard',
  'shit',
  'slut',
  'whore',
]);

const ANYWHERE = [
  'arrombad',
  'boquete',
  'buceta',
  'caralho',
  'estupr',
  'faggot',
  'filhodaputa',
  'fuck',
  'hitler',
  'nigga',
  'nigger',
  'pedofil',
  'punheta',
  'siririca',
  'xereca',
  'xoxota',
];

/** Letras de outros alfabetos que se passam por latinas. */
const CONFUSABLES: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  α: 'a',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  ν: 'v',
};

const LEET: Record<string, string> = {
  '0': 'o',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '+': 't',
};

/** O "1" e o "|" viram "i" ou "l" conforme a palavra; testamos as duas leituras. */
const AMBIGUOUS_LEET = /[1|]/g;

export function isOffensiveName(name: string): boolean {
  const base = [...name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()]
    .map((char) => CONFUSABLES[char] ?? char)
    .join('');

  return ['i', 'l'].some((one) => {
    const words = candidateWords(base, one);
    const compact = deLeet(base, one).replace(/[^a-z]/g, '');
    return words.some(matchesWholeWord) || ANYWHERE.some((term) => contains(compact, term));
  });
}

/** As palavras do nome lidas de vários jeitos, para pegar separadores e números colados. */
function candidateWords(base: string, one: string): string[] {
  const bySpace = base.split(/\s+/).filter(Boolean);
  const byPunctuation = base.split(/[^\p{L}\p{N}@$!|+]+/u).filter(Boolean);
  const words = [...bySpace, ...byPunctuation].map((token) =>
    deLeet(token.replace(/^\d{2,}|\d{2,}$/g, ''), one).replace(/[^a-z]/g, ''),
  );

  // "p u t a": letras soltas em sequência formam uma palavra.
  let run = '';
  for (const token of bySpace.map((t) => deLeet(t, one).replace(/[^a-z]/g, ''))) {
    if (token.length === 1) {
      run += token;
      continue;
    }
    if (run.length > 1) words.push(run);
    run = '';
  }
  if (run.length > 1) words.push(run);

  return words.filter(Boolean);
}

function deLeet(text: string, one: string): string {
  return [...text.replace(AMBIGUOUS_LEET, one)].map((char) => LEET[char] ?? char).join('');
}

/** "caralhoooo" → "caralhoo"; preserva letras duplas legítimas ("nigger", "glasses"). */
const atMostTwo = (text: string) => text.replace(/(.)\1{2,}/g, '$1$1');
/** "puuuta" → "puta". */
const single = (text: string) => text.replace(/(.)\1+/g, '$1');

/**
 * Também compara sem letras repetidas. Sem letra dupla, a palavra só pode bater com termos que
 * também não têm: "Niger" (o país) nunca vira "nigger".
 */
function matchesWholeWord(word: string): boolean {
  return WHOLE_WORDS.has(word) || WHOLE_WORDS.has(atMostTwo(word)) || WHOLE_WORDS.has(single(word));
}

/** Idem: o termo com letra dupla só é procurado como está. */
function contains(compact: string, term: string): boolean {
  if (compact.includes(term) || atMostTwo(compact).includes(term)) {
    return true;
  }
  return single(term) === term && single(compact).includes(term);
}
