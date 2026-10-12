import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DraftDocument } from '@/components/draft-document';
import { LegalPage } from '@/components/legal/legal-page';
import { AppealSteps } from '@/components/moderation/appeal-steps';
import { SectionTitle } from '@/components/section-title';
import { loadLegalDocument } from '@/lib/legal/load';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rules');
  return { title: t('title') };
}

/**
 * Regras de conduta (S07), de `docs/legal/regras-de-conduta.md`. A mensagem do jogo aponta para
 * `/regras#recurso` (APPEAL_PATH): o texto final tem a seção "Recurso"; até ele chegar, o aviso
 * de redação já traz o caminho de recurso com essa âncora.
 */
export default async function RulesPage() {
  const doc = await loadLegalDocument('regras-de-conduta');
  if (doc) return <LegalPage doc={doc} />;
  const t = await getTranslations('rules');
  return (
    <DraftDocument title={t('title')} status={t('status')} body={t('body')}>
      <section id="recurso" aria-labelledby="recurso-titulo" className="scroll-mt-6 pt-10">
        <SectionTitle id="recurso-titulo">{t('appeal.title')}</SectionTitle>
        <AppealSteps />
      </section>
    </DraftDocument>
  );
}
