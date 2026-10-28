'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import { Button } from '@/components/ui/button';
import { EncryptedText } from '@/components/ui/encrypted-text';
import type { FirstStepsLabels } from './first-steps';
import { useSession } from './session-provider';

/**
 * O Dialog dos Primeiros passos. Fica num arquivo à parte, carregado só quando alguém o abre: o
 * Dialog (Radix + animação) não entra no JS da primeira carga de toda página (orçamento de 275 kB).
 */
export function FirstStepsDialog({ labels }: { labels: FirstStepsLabels }) {
  const { firstSteps, account } = useSession();
  const pathname = usePathname();

  const steps = [labels.steps.add, labels.steps.equip, labels.steps.play];
  // O nome (o fictício, para quem ainda não escolheu um) é a única parte do título que decifra.
  const [before = '', after = ''] = labels.title.split('{name}');
  const name = account?.displayName ?? '';

  return (
    <Dialog
      open={firstSteps.dialogOpen && account !== null}
      onOpenChange={(open) => (open ? undefined : firstSteps.closeDialog())}
    >
      <DialogContent
        closeLabel={labels.close}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-xl"
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
          <DialogTitle>
            {before}
            {name ? <EncryptedText text={name} onceKey="welcome-name" /> : null}
            {after}
          </DialogTitle>
          <DialogDescription className="text-body-sm">{labels.intro}</DialogDescription>
        </div>

        {/* Três passos numerados, de uma linha cada: a ordem importa (adicionar, equipar, jogar). */}
        <ol className="grid gap-x-6 gap-y-5 sm:grid-cols-3" data-testid="first-steps-list">
          {steps.map((step, index) => (
            <li key={step.title} className="grid content-start gap-1.5">
              <span
                aria-hidden="true"
                className="mb-1 grid size-8 place-items-center rounded-full bg-(--fill-rest) text-body-sm font-semibold text-foreground tabular-nums"
              >
                {index + 1}
              </span>
              <h3 className="text-body-sm font-semibold">{step.title}</h3>
              <p className="text-body-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>

        <DialogFooter className="items-center sm:justify-start">
          <Button
            type="button"
            size="sm"
            onClick={firstSteps.dismiss}
            data-testid="first-steps-done"
          >
            {labels.done}
          </Button>
          {pathname === '/inventory' ? null : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventory" onClick={firstSteps.dismiss}>
                {labels.toInventory}
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
