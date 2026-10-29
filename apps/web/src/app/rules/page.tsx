import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DraftDocument } from '@/components/draft-document';
import { LegacyAnchors } from '@/components/legal/legacy-anchors';
import { LegalPage } from '@/components/legal/legal-page';
import { AppealSteps } from '@/components/moderation/appeal-steps';
import { SectionTitle } from '@/components/section-title';
import { loadLegalDocument } from '@/lib/legal/load';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rules');
  return { title: t('title') };
}

/** O endereço antigo da seção de recurso (`/regras#recurso`), que o 301 deixa chegar aqui. */
const LEGACY_ANCHORS = { '#recurso': '#appeal' } as const;

/**
 * Regras de conduta (S07), de `docs/legal/regras-de-conduta.md`. A mensagem do jogo aponta para
 * `/rules#appeal` (APPEAL_PATH): o texto final tem a seção "Recurso", com a âncora fixada em
 * `{#appeal}`; até ele chegar, o aviso de redação já traz o caminho de recurso com essa âncora.
 */
export default async function RulesPage() {
  const doc = await loadLegalDocument('regras-de-conduta');
  if (doc) {
    return (
      <>
        <LegacyAnchors aliases={LEGACY_ANCHORS} />
        <LegalPage doc={doc} />
      </>
    );
  }
  const t = await getTranslations('rules');
  return (
    <>
      <LegacyAnchors aliases={LEGACY_ANCHORS} />
      <DraftDocument title={t('title')} status={t('status')} body={t('body')}>
        <section id="appeal" aria-labelledby="appeal-title" className="scroll-mt-6 pt-10">
          <SectionTitle id="appeal-title">{t('appeal.title')}</SectionTitle>
          <AppealSteps />
        </section>
      </DraftDocument>
    </>
  );
}
