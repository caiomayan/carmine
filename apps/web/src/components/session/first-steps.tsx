'use client';

import { BoxIcon, ServerIcon, SquareTerminalIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { siSteam } from 'simple-icons';
import { XIcon } from '@/components/icons/animated/x';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { BrandIcon } from '@/components/icons/brand-icon';
import { Button } from '@/components/ui/button';
import { useSession } from './session-provider';

type Step = { title: string; body: ReactNode };

export type FirstStepsLabels = {
  title: string;
  intro: string;
  close: string;
  done: string;
  toInventory: string;
  reopenHint: string;
  steps: { what: Step; steam: Step; equip: Step; ingame: Step };
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Primeiros passos depois do primeiro login (S03): uma orientação curta no topo da página,
 * que abre sozinha só na sessão do primeiro login, fechável e reabrível pelo menu da Conta. Fecha encolhendo no lugar, sem empurrar o foco
 * para o nada: ele volta ao conteúdo.
 */
export function FirstSteps({ labels }: { labels: FirstStepsLabels }) {
  const { firstSteps, account } = useSession();
  const pathname = usePathname();
  // Movimento reduzido: sem encolher a altura (o conteúdo abaixo pularia); só um fade curto.
  const reduce = useReducedMotion();
  const hidden = reduce ? { opacity: 0 } : { height: 0, opacity: 0 };
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasClosed = useRef(false);

  // Reaberta pelo menu: o foco vai para o título, para quem navega por teclado ou leitor.
  useEffect(() => {
    if (firstSteps.open && wasClosed.current) headingRef.current?.focus();
    wasClosed.current = !firstSteps.open;
  }, [firstSteps.open]);

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

  const dismiss = () => {
    firstSteps.dismiss();
    document.getElementById('conteudo')?.focus({ preventScroll: true });
  };

  return (
    <AnimatePresence initial={false}>
      {firstSteps.open && account ? (
        <motion.div
          key="first-steps"
          initial={hidden}
          animate={{ height: 'auto', opacity: 1 }}
          exit={hidden}
          transition={{ duration: reduce ? 0.16 : 0.36, ease: EASE_OUT }}
          className="overflow-hidden"
        >
          <section
            aria-labelledby="primeiros-passos"
            data-testid="first-steps"
            className="container-page pt-6"
          >
            <div className="relative rounded-xl bg-surface p-6 max-md:p-5">
              <Button
                type="button"
                variant="quiet"
                size="icon"
                aria-label={labels.close}
                onClick={dismiss}
                className="absolute top-3 right-3"
              >
                <AnimatedIcon icon={XIcon} size={18} />
              </Button>

              <div className="grid max-w-[60ch] gap-1.5 pr-10">
                <h2
                  id="primeiros-passos"
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold tracking-[-0.01em] outline-none"
                >
                  {labels.title.replace('{name}', account.displayName)}
                </h2>
                <p className="text-[13.5px] text-muted-foreground">{labels.intro}</p>
              </div>

              <ul className="mt-6 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
                {steps.map((step, i) => (
                  <li
                    key={step.key}
                    className="enter-stagger grid content-start gap-1.5"
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <span className="mb-1 grid size-8 place-items-center rounded-full bg-surface-2 text-foreground">
                      {step.icon}
                    </span>
                    <h3 className="text-sm font-semibold">{step.title}</h3>
                    <p className="text-[13px] leading-[1.55] text-muted-foreground">{step.body}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
                <Button type="button" size="sm" onClick={dismiss}>
                  {labels.done}
                </Button>
                {pathname === '/inventario' ? null : (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/inventario" onClick={() => firstSteps.dismiss()}>
                      {labels.toInventory}
                    </Link>
                  </Button>
                )}
                <p className="text-xs text-muted-foreground max-md:basis-full">
                  {labels.reopenHint}
                </p>
              </div>
            </div>
          </section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
