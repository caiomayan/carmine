import type { ReactNode } from 'react';
import styles from './page-head.module.css';

export function PageHead({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className={styles.head}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.sub}>{subtitle}</p> : null}
    </div>
  );
}
