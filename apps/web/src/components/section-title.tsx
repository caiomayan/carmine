import type { ReactNode } from 'react';
import styles from './section-title.module.css';

/** Título de seção da 2c: Inter em versalete, losango carmim e filete duplo. */
export function SectionTitle({
  id,
  children,
  aside,
}: {
  id?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <h2 id={id} className={styles.title}>
        {children}
      </h2>
      {aside}
    </div>
  );
}
