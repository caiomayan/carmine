import type { ReactNode } from 'react';
import styles from './empty-state.module.css';

/** Painel de estado vazio com os cantos art déco (colchetes em couro) da 2c. */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: ReactNode;
  body: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.panel} ${className ?? ''}`}>
      <span className={styles.seal} aria-hidden="true" />
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
