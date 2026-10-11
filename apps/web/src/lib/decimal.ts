/** Número digitado no formulário: aceita vírgula (PT-BR) ou ponto; `null` se não é número. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Número em PT-BR com até `decimals` casas (ou exatamente, com `fixed`), sem separador de milhar. */
export function formatDecimal(value: number, decimals: number, { fixed = false } = {}): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: fixed ? decimals : 0,
    maximumFractionDigits: decimals,
    useGrouping: false,
  });
}
