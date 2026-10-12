import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DraftDocument } from '@/components/draft-document';
import { LegalPage } from '@/components/legal/legal-page';
import { loadLegalDocument } from '@/lib/legal/load';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('terms');
  return { title: t('title') };
}

/** De `docs/legal/termos-de-uso.md`; até o texto existir, o aviso de redação. */
export default async function TermsPage() {
  const doc = await loadLegalDocument('termos-de-uso');
  if (doc) return <LegalPage doc={doc} />;
  const t = await getTranslations('terms');
  return <DraftDocument title={t('title')} status={t('status')} body={t('body')} />;
}
