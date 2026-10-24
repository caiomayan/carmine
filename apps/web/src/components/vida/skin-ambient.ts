/**
 * Cor ambiente e holo tingidos pela skin. As funções são puras e rodam no cliente: a paleta (as cores vivas
 * extraídas da imagem da skin) vem pronta do servidor, por `skinPalette(id)` de `@/lib/skin-palette`, e chega aqui
 * como argumento. Assim os dados de todo o catálogo nunca entram no JavaScript do navegador.
 *
 * Sem paleta (skin nova ou sem imagem), as duas caem na cor da raridade: nunca num vermelho de reserva.
 */

export type SkinPalette = readonly string[] | null | undefined;

/**
 * As três cores do brilho ambiente da tela (--amb-1..3, ver `.v-ambient` em vida.css): as duas da skin (ou a
 * cor da raridade) e, em terceiro, a do lado em foco (TR laranja, CT azul), que dá o tom do fundo.
 */
export function ambientFor(
  palette: SkinPalette,
  rarityVar: string | null | undefined,
  sideVar: string,
): [string, string, string] {
  const base = rarityVar ?? 'var(--muted)';
  const a = palette?.[0] ?? base;
  const b = palette?.[1] ?? palette?.[0] ?? base;
  return [a, b, sideVar];
}

/** Âmbar metálico do StatTrak. */
const AMBER = ['#ff9a2e', '#ffc873', '#e0701a'] as const;

/**
 * As variáveis do holo (--h1..--h3, lidas por `.v-holo` em vida.css): o brilho é metálico e tingido pela própria
 * skin (as 2 a 3 cores da paleta, as mesmas da cor ambiente) com um reflexo especular branco que segue o mouse.
 * StatTrak troca para um âmbar metálico; facas e luvas (★) ganham a folha dourada com `data-foil` no elemento.
 * Nunca o arco-íris.
 */
export function holoStyle(
  palette: SkinPalette,
  rarityVar: string,
  opts: { statTrak?: boolean } = {},
): Record<'--h0' | '--h1' | '--h2' | '--h3', string> {
  const a = palette?.[0] ?? rarityVar;
  const b = palette?.[1] ?? palette?.[0] ?? rarityVar;
  const c = palette?.[2] ?? palette?.[1] ?? palette?.[0] ?? rarityVar;
  if (opts.statTrak) return { '--h0': a, '--h1': AMBER[0], '--h2': AMBER[1], '--h3': AMBER[2] };
  return { '--h0': a, '--h1': a, '--h2': b, '--h3': c };
}
