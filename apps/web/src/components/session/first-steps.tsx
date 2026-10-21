'use client';

import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { XIcon } from '@/components/icons/animated/x';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { showsFirstStepsStrip } from '@/lib/first-steps';
import { useSession } from './session-provider';

const FirstStepsDialog = dynamic(
  () => import('./first-steps-dialog').then((module) => module.FirstStepsDialog),
  { ssr: false },
);

type Step = { title: string; body: ReactNode };

export type FirstStepsLabels = {
  title: string;
  intro: string;
  /** A linha da faixa. */
  strip: string;
  /** O botão da faixa que abre o Dialog. */
  open: string;
  close: string;
  done: string;
  toInventory: string;
  reopenHint: string;
  steps: { what: Step; steam: Step; equip: Step; ingame: Step };
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Primeiros passos (S03): na sessão do primeiro login, uma faixa de uma linha no alto da home e do
 * Perfil convida a "Ver como funciona"; o Dialog traz os passos. A faixa se dispensa (e não volta
 * nesta Conta); o Dialog se reabre pelo menu da Conta, em qualquer rota.
 */
export function FirstSteps({ labels }: { labels: FirstStepsLabels }) {
  const { firstSteps, account } = useSession();
  // Carrega o Dialog na 1ª vez que abre e o mantém montado depois, para ele poder animar a saída.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (firstSteps.dialogOpen && account) setLoaded(true);
  }, [firstSteps.dialogOpen, account]);

  return (
    <>
      <FirstStepsStrip labels={labels} />
      {loaded ? <FirstStepsDialog labels={labels} /> : null}
    </>
  );
}

function FirstStepsStrip({ labels }: { labels: FirstStepsLabels }) {
  const { firstSteps, account } = useSession();
  const pathname = usePathname();
  // Movimento reduzido: sem encolher a altura (o conteúdo abaixo pularia); só um fade curto.
  const reduce = useReducedMotion();
  const hidden = reduce ? { opacity: 0 } : { height: 0, opacity: 0 };
  const visible = Boolean(
    firstSteps.strip && account && showsFirstStepsStrip(pathname, account.publicId),
  );

  const dismiss = () => {
    firstSteps.dismiss();
    document.getElementById('conteudo')?.focus({ preventScroll: true });
  };

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <m.div
          key="first-steps-strip"
          initial={hidden}
          animate={{ height: 'auto', opacity: 1 }}
          exit={hidden}
          transition={{ duration: reduce ? 0.16 : 0.36, ease: EASE_OUT }}
          className="overflow-hidden"
        >
          <section
            aria-label={labels.title.replace('{name}', account?.displayName ?? '')}
            data-testid="first-steps-strip"
            className="container-page pt-4"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-surface py-2 pr-2 pl-4 max-md:pl-3">
              <p className="min-w-[14rem] flex-1 text-[13.5px]">{labels.strip}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-testid="first-steps-open"
                onClick={(event) => firstSteps.openDialog(event.currentTarget)}
              >
                {labels.open}
              </Button>
              <Button
                type="button"
                variant="quiet"
                size="icon"
                aria-label={labels.close}
                onClick={dismiss}
                data-testid="first-steps-dismiss"
              >
                <AnimatedIcon icon={XIcon} size={18} />
              </Button>
            </div>
          </section>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
