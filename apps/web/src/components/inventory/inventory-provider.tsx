'use client';

import { AnimatePresence, motion } from 'motion/react';
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

type Notice =
  | { kind: 'info'; id: number; message: string }
  | { kind: 'undo'; id: number; message: string; uid: string; name: string };

type InventoryContextValue = {
  /** Aviso curto (Item adicionado, alterações salvas). `highlight` marca o cartão na grade. */
  notify: (message: string, highlight?: string) => void;
  /** Oferece "Desfazer" por 8 s para um Item que acabou de sair do Inventário. */
  offerUndo: (uid: string, name: string) => void;
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

  const offerUndo = useCallback(
    (uid: string, name: string) => {
      remaining.current = UNDO_WINDOW_MS;
      setPaused(false);
      setNotice({ kind: 'undo', id: nextId.current++, uid, name, message: t('removed', { name }) });
    },
    [t],
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
      const response = await mutate(`/api/inventory/items/${notice.uid}/restore`, {
        method: 'POST',
      });
      if (response.status === 401) return;
      if (!response.ok) throw new Error(String(response.status));
      setNotice({
        kind: 'info',
        id: nextId.current++,
        message: t('undone', { name: notice.name }),
      });
      setHighlight(notice.uid);
      router.refresh();
    } catch {
      setNotice({ kind: 'info', id: nextId.current++, message: t('undoFailed') });
    } finally {
      setUndoing(false);
    }
  }, [mutate, notice, router, t]);

  const value = useMemo(() => ({ notify, offerUndo, highlight }), [notify, offerUndo, highlight]);

  return (
    <InventoryContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-(--mx) pb-[max(16px,env(safe-area-inset-bottom))]"
      >
        <AnimatePresence>
          {notice ? (
            <motion.div
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
                  data-testid="undo-remove"
                >
                  {undoing ? t('undoing') : t('undo')}
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
            </motion.div>
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
