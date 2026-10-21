'use client';

import { BoxIcon, ServerIcon, SquareTerminalIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { siSteam } from 'simple-icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import { BrandIcon } from '@/components/icons/brand-icon';
import { Button } from '@/components/ui/button';
import type { FirstStepsLabels } from './first-steps';
import { useSession } from './session-provider';

/**
 * O Dialog dos Primeiros passos. Fica num arquivo à parte, carregado só quando alguém o abre: o
 * Dialog (Radix + animação) não entra no JS da primeira carga de toda página (orçamento de 275 kB).
 */
export function FirstStepsDialog({ labels }: { labels: FirstStepsLabels }) {
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
