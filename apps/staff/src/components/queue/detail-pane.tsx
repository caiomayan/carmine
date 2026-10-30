'use client';

import { Dialog } from 'radix-ui';
import { type ReactNode, useSyncExternalStore } from 'react';
import { usePanelRoot } from '@/components/shell/panel-root';

/** O detalhe fica ao lado da tabela em tela larga e sobe como folha nas outras. */
const WIDE = '(min-width: 1281px)';

const subscribe = (callback: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};

export const useWide = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );

/**
 * O detalhe de um caso: uma coluna ao lado da lista (tela larga) ou uma folha com foco preso (as outras larguras).
 * `label` é o nome acessível; quem renderiza o cabeçalho com o botão de fechar é o `children`.
 */
export function DetailPane({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const wide = useWide();
  const root = usePanelRoot();
  if (wide) {
    return open ? (
      <aside className="stp-card stp-detail" data-testid="stp-detail" aria-label={label}>
        {children}
      </aside>
    ) : null;
  }
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal container={root}>
        <Dialog.Overlay className="stp-overlay" />
        <Dialog.Content
          className="stp-drawer stp-detail"
          data-testid="stp-detail"
          aria-describedby={undefined}
        >
          <Dialog.Title className="stp-sr">{label}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
