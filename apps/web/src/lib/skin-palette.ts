import palettes from './skin-palettes.json';

/**
 * Cores vivas extraídas da imagem de cada skin (até 3, em `skin-palettes.json`, gerado por
 * `scripts/vida-palettes.mjs`). **Só no servidor**: o arquivo cobre o catálogo inteiro e não deve ir ao
 * navegador; as telas leem a paleta aqui e passam as cores como props para `ambientFor` e `holoStyle`
 * (`@/components/vida/skin-ambient`).
 */
const SKINS = palettes as Record<string, string[]>;

/** As cores da skin, ou nulo quando ela não tem paleta (o holo e a cor ambiente caem na cor da raridade). */
export function skinPalette(id: number): readonly string[] | null {
  return SKINS[String(id)] ?? null;
}
