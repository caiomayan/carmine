'use client';

import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { BoxIcon, ServerIcon, SquareTerminalIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { siSteam } from 'simple-icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import { XIcon } from '@/components/icons/animated/x';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { BrandIcon } from '@/components/icons/brand-icon';
import { Button } from '@/components/ui/button';
import { showsFirstStepsStrip } from '@/lib/first-steps';
import { useSession } from './session-provider';

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
  return (
    <>
      <FirstStepsStrip labels={labels} />
      <FirstStepsDialog labels={labels} />
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
                className="bg-surface-2 hover:bg-line"
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

function FirstStepsDialog({ labels }: { labels: FirstStepsLabels }) {
  const { firstSteps, account } = useSession();
  const pathname = usePathname();

  const steps = [
    { key: 'what', icon: <ServerIcon size={16} strokeWidth={2} />, ...labels.steps.what },
    { key: 'steam', icon: <BrandIcon icon={siSteam} size={15} />, ...labels.steps.steam },
    { key: 'equip', icon: <BoxIcon size={16} strokeWidth={2} />, ...labels.steps.equip },
    {
      key: 'ingame',
      icon: <SquareTerminalIcon size={16} strokeWidth={2} />,
      ...labels.steps.ingame,
    },
  ];

  return (
    <Dialog
      open={firstSteps.dialogOpen && account !== null}
      onOpenChange={(open) => (open ? undefined : firstSteps.closeDialog())}
    >
      <DialogContent
        closeLabel={labels.close}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl"
        data-testid="first-steps"
        // Aberto por estado (sem DialogTrigger): o foco volta a quem abriu; se ele saiu da tela
        // (a faixa some ao dispensar), vai para o conteúdo.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = firstSteps.opener.current;
          (opener?.isConnected ? opener : document.getElementById('conteudo'))?.focus({
            preventScroll: true,
          });
        }}
      >
        <div className="grid max-w-[60ch] gap-1.5 pr-8">
          <DialogTitle>{labels.title.replace('{name}', account?.displayName ?? '')}</DialogTitle>
          <DialogDescription className="text-[13.5px] leading-[1.55]">
            {labels.intro}
          </DialogDescription>
        </div>

        <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.key} className="grid content-start gap-1.5">
              <span className="mb-1 grid size-8 place-items-center rounded-full bg-surface-2 text-foreground">
                {step.icon}
              </span>
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <p className="text-[13px] leading-[1.55] text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ul>

        <DialogFooter className="items-center sm:justify-start">
          <Button
            type="button"
            size="sm"
            onClick={firstSteps.dismiss}
            data-testid="first-steps-done"
          >
            {labels.done}
          </Button>
          {pathname === '/inventario' ? null : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventario" onClick={firstSteps.dismiss}>
                {labels.toInventory}
              </Link>
            </Button>
          )}
          <p className="text-xs text-muted-foreground max-sm:basis-full sm:ml-auto">
            {labels.reopenHint}
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
