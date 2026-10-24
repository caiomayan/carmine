import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { FileTextIcon } from '@/components/icons/animated/file-text';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { PageHead } from '@/components/page-head';
import { type LegalDocument, legalHeadings } from '@/lib/legal/document';
import { LegalMarkdown } from './legal-markdown';
import { LegalToc } from './legal-toc';

/**
 * Página de um documento legal de `docs/legal/`: título, data e versão, aviso de rascunho
 * (abaixo da 1.0.0), sumário pelas seções `##` e o texto.
 */
export async function LegalPage({ doc }: { doc: LegalDocument }) {
  const t = await getTranslations('legal');
  const format = await getFormatter();
  const headings = legalHeadings(doc.body);
  // Meio-dia em Brasília: a data do front-matter nunca vira o dia anterior por causa do fuso.
  const updated = format.dateTime(new Date(`${doc.updatedAt}T12:00:00-03:00`), {
    dateStyle: 'long',
  });

  return (
    <div className="container-page pb-16">
      <PageHead
        className="animate-fade-up"
        title={doc.title}
        subtitle={
          <span data-testid="legal-meta">
            {t('updated', { date: updated, version: doc.version })}
          </span>
        }
      />
      {doc.draft ? <Callout testId="legal-draft">{t('draftNotice')}</Callout> : null}
      <div className="grid animate-fade-up grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-8 pt-2 [animation-delay:60ms] lg:grid-cols-[200px_minmax(0,1fr)]">
        {headings.length > 2 ? (
          <nav
            aria-labelledby="sumario"
            className="lg:sticky lg:top-[calc(var(--site-hdr-h)+24px)] lg:self-start"
          >
            <h2 id="sumario" className="label-caps pb-2.5 text-[11px] text-muted-foreground">
              {t('toc')}
            </h2>
            <LegalToc headings={headings} />
          </nav>
        ) : null}
        <LegalMarkdown body={doc.body} gapLabel={t('gap')} />
      </div>
    </div>
  );
}

/** Nota informativa (ícone de documento em azul de contexto): rascunho, documento em redação. */
export function Callout({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-icon-trigger
      data-testid={testId}
      className="mb-6 grid max-w-[68ch] animate-fade-up grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg bg-surface px-4 py-3.5 text-body-sm leading-[1.6] [animation-delay:30ms]"
    >
      <AnimatedIcon icon={FileTextIcon} size={16} className="mt-0.5 text-status-info" />
      <p>{children}</p>
    </div>
  );
}
