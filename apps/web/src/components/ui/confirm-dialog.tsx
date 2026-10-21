'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import { Button } from '@/components/ui/button';

/**
 * Confirmação de uma ação sem volta: Dialog do Animate UI com `role="alertdialog"`. O foco
 * inicial fica em "Cancelar" (Enter sem querer não confirma) e clicar fora não fecha; Esc fecha.
 * Como é aberto por estado (sem `DialogTrigger`), guarda quem tinha o foco e o devolve ao fechar.
 * O resultado da ação (erro, sucesso) é de quem usa: este componente só pergunta.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  testId?: string;
}) {
  const t = useTranslations('common');
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        role="alertdialog"
        closeLabel={t('close')}
        className="gap-5 sm:max-w-md"
        data-testid={testId}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          opener.current = document.activeElement as HTMLElement | null;
          (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-cancel]')?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="grid gap-2 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-[13.5px] leading-[1.55]">{description}</div>
          </DialogDescription>
        </div>
        <DialogFooter>
          <Button variant="ghost" data-cancel onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
            data-testid="confirm-action"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
