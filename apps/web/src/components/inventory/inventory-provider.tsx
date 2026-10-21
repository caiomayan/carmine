'use client';

import { AnimatePresence, m } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckIcon } from '@/components/icons/animated/check';
import { UndoIcon } from '@/components/icons/animated/undo';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { useSession } from '@/components/session/session-provider';
import { Button } from '@/components/ui/button';

/** Por quanto tempo o "Desfazer" fica na tela (S04). A API guarda o Item por 30 s. */
export const UNDO_WINDOW_MS = 8000;
const NOTICE_MS = 5000;

/** O resultado de desfazer: a mensagem que substitui o aviso e o cartão a destacar. */
export type UndoOutcome = { message: string; highlight?: string };

type Notice =
  | { kind: 'info'; id: number; message: string }
  | {
      kind: 'undo';
      id: number;
      message: string;
      undo: () => Promise<UndoOutcome>;
      label: string;
      pending: string;
    };

type InventoryContextValue = {
  /** Aviso curto (Item adicionado, alterações salvas). `highlight` marca o cartão na grade. */
  notify: (message: string, highlight?: string) => void;
  /** Oferece "Desfazer" por 8 s para um Item que acabou de sair do Inventário. */
  offerUndo: (uid: string, name: string) => void;
  /**
   * Oferece "Desfazer" por 8 s para uma mudança qualquer (equipar, desequipar). `undo` lança
   * em caso de falha; a mensagem de falha é `failure`.
   */
  offerAction: (action: {
    message: string;
    undo: () => Promise<UndoOutcome>;
    failure: string;
    labels?: { undo: string; undoing: string };
  }) => void;
  /** O cartão que acabou de mudar (para a grade destacar uma vez). */
  highlight: string | null;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

/**
 * Estado que atravessa as páginas do Inventário (vive no layout): o aviso do que acabou de
 * acontecer e o "Desfazer" da remoção, que continua na tela quando o editor volta para a grade.
 * O tempo do "Desfazer" pausa com o ponteiro ou o foco em cima (WCAG 2.2.1).
 */
export function InventoryProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('inventory.remove');
  const router = useRouter();
  const { mutate } = useSession();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(0);
  const startedAt = useRef(0);
  const nextId = useRef(1);

  const notify = useCallback((message: string, uid?: string) => {
    setNotice({ kind: 'info', id: nextId.current++, message });
    setHighlight(uid ?? null);
  }, []);

  const failureMessage = useRef('');

  const offerAction = useCallback<InventoryContextValue['offerAction']>(
    ({ message, undo, failure, labels }) => {
      remaining.current = UNDO_WINDOW_MS;
      failureMessage.current = failure;
      setPaused(false);
      setHighlight(null);
      setNotice({
        kind: 'undo',
        id: nextId.current++,
        message,
        undo,
        label: labels?.undo ?? t('undo'),
        pending: labels?.undoing ?? t('undoing'),
      });
    },
    [t],
  );

  const offerUndo = useCallback(
    (uid: string, name: string) =>
      offerAction({
        message: t('removed', { name }),
        failure: t('undoFailed'),
        undo: async () => {
          const response = await mutate(`/api/inventory/items/${uid}/restore`, {
            method: 'POST',
          });
          if (!response.ok) throw new Error(String(response.status));
          return { message: t('undone', { name }), highlight: uid };
        },
      }),
    [mutate, offerAction, t],
  );

  // O relógio do aviso: corre enquanto não estiver pausado.
  useEffect(() => {
    if (!notice || paused || undoing) return;
    const total = notice.kind === 'undo' ? remaining.current : NOTICE_MS;
    startedAt.current = Date.now();
    const timer = setTimeout(() => setNotice(null), total);
    return () => {
      clearTimeout(timer);
      if (notice.kind === 'undo') {
        remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
      }
    };
  }, [notice, paused, undoing]);

  const undo = useCallback(async () => {
    if (notice?.kind !== 'undo') return;
    setUndoing(true);
    try {
      const outcome = await notice.undo();
      setNotice({ kind: 'info', id: nextId.current++, message: outcome.message });
      setHighlight(outcome.highlight ?? null);
      router.refresh();
    } catch {
      setNotice({ kind: 'info', id: nextId.current++, message: failureMessage.current });
    } finally {
      setUndoing(false);
    }
  }, [notice, router]);

  const value = useMemo(
    () => ({ notify, offerUndo, offerAction, highlight }),
    [notify, offerUndo, offerAction, highlight],
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-(--mx) pb-[calc(max(16px,env(safe-area-inset-bottom))+var(--dock-h,0px))]"
      >
        <AnimatePresence>
          {notice ? (
            <m.div
              key={notice.id}
              role="status"
              data-testid={notice.kind === 'undo' ? 'undo-toast' : 'notice-toast'}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              onPointerEnter={() => setPaused(true)}
              onPointerLeave={() => setPaused(false)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              className="pointer-events-auto relative flex w-full max-w-[460px] items-center gap-3 overflow-hidden rounded-xl bg-popover py-2.5 pr-2.5 pl-4 text-[13.5px] shadow-[0_18px_48px_-18px_var(--shadow),0_0_0_1px_var(--line)]"
              data-icon-trigger
            >
              <AnimatedIcon
                icon={notice.kind === 'undo' ? UndoIcon : CheckIcon}
                size={15}
                className={notice.kind === 'undo' ? 'text-muted-foreground' : 'text-status-success'}
              />
              <span className="min-w-0 flex-1">{notice.message}</span>
              {notice.kind === 'undo' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={undo}
                  disabled={undoing}
                  data-testid="undo-action"
                >
                  {undoing ? notice.pending : notice.label}
                </Button>
              ) : null}
              {notice.kind === 'undo' ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-foreground/50 motion-reduce:hidden"
                  style={{
                    animation: `undo-countdown ${UNDO_WINDOW_MS}ms linear forwards`,
                    animationPlayState: paused || undoing ? 'paused' : 'running',
                  }}
                />
              ) : null}
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </InventoryContext.Provider>
  );
}

export function useInventory(): InventoryContextValue {
  const value = useContext(InventoryContext);
  if (!value) throw new Error('useInventory fora do InventoryProvider');
  return value;
}
