import {
  serverCodeSchema,
  serverHostname,
  serverShowcaseNameSchema,
} from '@carmine/contracts/staff';

/**
 * "sp.1", "sp-1" ou "sp 1" viram `SP·1`: o ponto médio (U+00B7) não está no teclado. O que não parece um código volta
 * como veio (sem as pontas), para o contrato recusar.
 */
export function normalizeServerCode(input: string): string {
  const match = /^\s*([a-z]{2,3})\s*[.\-·\s]\s*(\d{1,2})\s*$/i.exec(input);
  return match ? `${match[1]?.toUpperCase()}·${match[2]}` : input.trim();
}

/** O hostname que o jogo vai mostrar, ou `null` enquanto o nome ou o código não valem (o contrato decide). */
export function previewHostname(showcaseName: string, code: string): string | null {
  const name = serverShowcaseNameSchema.safeParse(showcaseName);
  const parsedCode = serverCodeSchema.safeParse(code);
  return name.success && parsedCode.success ? serverHostname(name.data, parsedCode.data) : null;
}
