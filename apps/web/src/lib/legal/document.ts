/**
 * Documentos legais (Regras de conduta, Termos, Privacidade) escritos em markdown em
 * `docs/legal/`, com front-matter `title`, `updatedAt` (AAAA-MM-DD) e `version` (semver).
 * Abaixo da versão 1.0.0 o documento é rascunho: a página avisa, e os marcadores de revisão
 * jurídica e o bloco final de rascunho não aparecem como se fossem texto; as lacunas do dono
 * (`[DONO: ...]`, `[CONFIRMAR: ...]`) aparecem destacadas como pendência.
 */
export type LegalDocument = {
  title: string;
  updatedAt: string;
  version: string;
  draft: boolean;
  body: string;
};

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n?/;
const REVIEW_MARKER = /\s*\[VALIDAR COM ADVOGADO\]/g;
/** Lacunas que o dono ainda vai preencher: `[DONO: ...]` e `[CONFIRMAR: ...]`. */
const OWNER_GAP = /\[(DONO|CONFIRMAR):\s*([^\]\n]+)\]/g;
/** Âncora que o leitor desenha como pendência, não como link. */
export const GAP_HREF = '#pendencia';
/** O último bloco `>` do arquivo (a nota de rascunho do redator). */
const TRAILING_QUOTE = /(?:\n>[^\n]*)+\s*$/;

export function parseLegalDocument(source: string): LegalDocument {
  const text = source.replace(/\r\n?/g, '\n');
  const match = FRONT_MATTER.exec(text);
  if (!match) throw new Error('documento legal sem front-matter');
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? '').split('\n')) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  const title = fields.get('title');
  const updatedAt = fields.get('updatedAt');
  const version = fields.get('version');
  if (!title || !updatedAt || !/^\d{4}-\d{2}-\d{2}$/.test(updatedAt) || !version) {
    throw new Error('front-matter do documento legal incompleto (title, updatedAt, version)');
  }
  const draft = Number.parseInt(version, 10) < 1;
  let body = text.slice(match[0].length).trim();
  if (draft) {
    body = `\n${body}`
      .replace(REVIEW_MARKER, '')
      .replace(TRAILING_QUOTE, '')
      .replace(OWNER_GAP, (_, kind: string, gap: string) => `[${kind}: ${gap.trim()}](${GAP_HREF})`)
      .trim();
  }
  return { title, updatedAt, version, draft, body };
}

/** Âncora de uma seção: minúsculas, sem acento, palavras ligadas por hífen. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Os títulos `##` do documento, na ordem, para o sumário (fora dos blocos de código). */
export function legalHeadings(body: string): { id: string; text: string }[] {
  const headings: { id: string; text: string }[] = [];
  let inCode = false;
  for (const line of body.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode;
    else if (!inCode && line.startsWith('## ')) {
      const text = line.slice(3).trim();
      headings.push({ id: slugify(text), text });
    }
  }
  return headings;
}
