import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DraftDocument } from '@/components/draft-document';
import { LegalPage } from '@/components/legal/legal-page';
import { loadLegalDocument } from '@/lib/legal/load';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('refund');
  return { title: t('title') };
}

/** De `docs/legal/politica-de-reembolso.md`; até o texto existir, o aviso de redação. */
export default async function RefundPage() {
  const doc = await loadLegalDocument('politica-de-reembolso');
  if (doc) return <LegalPage doc={doc} />;
  const t = await getTranslations('refund');
  return <DraftDocument title={t('title')} status={t('status')} body={t('body')} />;
}
