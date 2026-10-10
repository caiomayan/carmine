import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import styles from './site-footer.module.css';

export async function SiteFooter() {
  const t = await getTranslations('shell.footer');

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.bar}`}>
        <p className={styles.meta}>
          <span>{t('copyright', { year: new Date().getFullYear() })}</span>
          <span className={styles.sep} aria-hidden="true" />
          <span>{t('region')}</span>
        </p>
        <nav aria-label={t('nav')}>
          <ul className={styles.links}>
            <li>
              <Link href="/termos" className={styles.link}>
                {t('terms')}
              </Link>
            </li>
            <li>
              <Link href="/privacidade" className={styles.link}>
                {t('privacy')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
