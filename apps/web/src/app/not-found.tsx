import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound');
  return { title: t('metaTitle') };
}

export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <div className="container page nf-wrap">
      <div className="nf-card">
        <h1 className="nf-title">{t('title')}</h1>
        <p className="nf-body">{t('body')}</p>
        <div className="nf-actions">
          <Link href="/" className="btn btn-primary">
            {t('back')}
          </Link>
          <span className="label">{t('code')}</span>
        </div>
      </div>
    </div>
  );
}
