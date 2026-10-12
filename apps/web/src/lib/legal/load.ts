import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';
import { type LegalDocument, parseLegalDocument } from './document';

/** Arquivos de `docs/legal/` que o web publica. */
export type LegalSlug =
  | 'regras-de-conduta'
  | 'termos-de-uso'
  | 'politica-de-privacidade'
  | 'politica-de-reembolso';

/**
 * Lê `docs/legal/<slug>.md` da raiz do monorepo. No `next dev`/`next start` o diretório atual é
 * `apps/web`; na imagem standalone o `server.js` também roda de `apps/web` e os arquivos entram
 * pelo `outputFileTracingIncludes`. Nulo enquanto o documento não existe: a página mostra o
 * aviso de redação. Um arquivo malformado derruba a página (melhor que publicar texto quebrado).
 */
export const loadLegalDocument = cache(async (slug: LegalSlug): Promise<LegalDocument | null> => {
  const file = path.join(process.cwd(), '../../docs/legal', `${slug}.md`);
  let source: string;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return parseLegalDocument(source);
});
