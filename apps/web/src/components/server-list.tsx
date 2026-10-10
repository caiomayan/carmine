import type { CSSProperties } from 'react';
import styles from './server-list.module.css';

type Columns = { server: string; map: string; players: string; status: string };

export function ServerListColumns({ labels }: { labels: Columns }) {
  return (
    <div className={`${styles.cols} label`} aria-hidden="true">
      <span>{labels.server}</span>
      <span>{labels.map}</span>
      <span>{labels.players}</span>
      <span>{labels.status}</span>
      <span />
    </div>
  );
}

/**
 * Linha de servidor sem dados. `loading` liga a varredura do skeleton; sem ela a linha é
 * só a silhueta da lista (fundo do estado vazio). Sempre decorativa para leitores de tela.
 */
export function ServerRowSkeleton({
  index = 0,
  loading = false,
}: {
  index?: number;
  loading?: boolean;
}) {
  const shim = loading ? `shim ${styles.shim}` : styles.ghost;
  return (
    <div className={`${styles.row} enter`} style={{ '--i': index } as CSSProperties}>
      <div className={styles.main}>
        <span className={`${shim} ${styles.chip}`} />
        <div className={styles.lines}>
          <span className={`${shim} ${styles.l1}`} />
          <span className={`${shim} ${styles.l2}`} />
        </div>
      </div>
      <div className={styles.map}>
        <span className={`${shim} ${styles.thumb}`} />
        <div className={styles.lines}>
          <span className={`${shim} ${styles.l1} ${styles.short}`} />
          <span className={`${shim} ${styles.l2}`} />
        </div>
      </div>
      <div className={styles.players}>
        <span className={`${shim} ${styles.l1} ${styles.tiny}`} />
        <span className={`${shim} ${styles.bar}`} />
      </div>
      <div className={styles.status}>
        <span className={`${shim} ${styles.l2} ${styles.tiny}`} />
      </div>
      <span className={`${shim} ${styles.btn}`} />
    </div>
  );
}
