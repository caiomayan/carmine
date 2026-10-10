import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { NavLink } from './nav-link';
import styles from './site-header.module.css';
import { ThemeToggle } from './theme-toggle';
import { Wordmark } from './wordmark';

export async function SiteHeader() {
  const t = await getTranslations('shell');

  return (
    <header className={styles.header}>
      <div className={`container ${styles.bar}`}>
        <Link href="/" className={styles.brand} aria-label={t('homeLink')}>
          <Wordmark className={styles.wordmark} />
        </Link>
        <nav className={styles.nav} aria-label={t('mainNav')}>
          <ul className={styles.navList}>
            <li>
              <NavLink href="/" className={styles.navLink}>
                {t('nav.servers')}
              </NavLink>
            </li>
            <li>
              <NavLink href="/inventario" className={styles.navLink}>
                {t('nav.inventory')}
              </NavLink>
            </li>
          </ul>
        </nav>
        <div className={styles.end}>
          <ThemeToggle labels={{ light: t('theme.useLight'), dark: t('theme.useDark') }} />
        </div>
      </div>
    </header>
  );
}
