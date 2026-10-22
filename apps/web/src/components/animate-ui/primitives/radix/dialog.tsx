'use client';

import { AnimatePresence, type HTMLMotionProps, m } from 'framer-motion';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';

import { useControlledState } from '@/hooks/use-controlled-state';
import { getStrictContext } from '@/lib/get-strict-context';
import { dialogMotion, overlayMotion, withTransition } from '@/lib/motion';

type DialogContextType = {
  isOpen: boolean;
  setIsOpen: DialogProps['onOpenChange'];
};

const [DialogProvider, useDialog] = getStrictContext<DialogContextType>('DialogContext');

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;

function Dialog(props: DialogProps) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props?.open,
    defaultValue: props?.defaultOpen,
    onChange: props?.onOpenChange,
  });

  return (
    <DialogProvider value={{ isOpen, setIsOpen }}>
      <DialogPrimitive.Root data-slot="dialog" {...props} onOpenChange={setIsOpen} />
    </DialogProvider>
  );
}

type DialogTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger>;

function DialogTrigger(props: DialogTriggerProps) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

type DialogPortalProps = Omit<React.ComponentProps<typeof DialogPrimitive.Portal>, 'forceMount'>;

function DialogPortal(props: DialogPortalProps) {
  const { isOpen } = useDialog();

  return (
    <AnimatePresence>
      {isOpen && <DialogPrimitive.Portal data-slot="dialog-portal" forceMount {...props} />}
    </AnimatePresence>
  );
}

type DialogOverlayProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Overlay>,
  'forceMount' | 'asChild'
> &
  HTMLMotionProps<'div'>;

/** O fundo escurece no mesmo tempo do painel: entra em `base`, sai em `fast`. */
function DialogOverlay({ transition, ...props }: DialogOverlayProps) {
  const motion = withTransition(overlayMotion, transition);
  return (
    <DialogPrimitive.Overlay data-slot="dialog-overlay" asChild forceMount>
      <m.div
        key="dialog-overlay"
        initial={motion.initial}
        animate={motion.animate}
        exit={motion.exit}
        {...props}
      />
    </DialogPrimitive.Overlay>
  );
}

type DialogContentProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Content>,
  'forceMount' | 'asChild'
> &
  HTMLMotionProps<'div'>;

/**
 * Entra com opacidade, 8 px de baixo para cima e escala de 98% a 100% (`dialogMotion`), em
 * `--dur-base`; sai em `--dur-fast`. Só `opacity`, `y` e `scale`: com `prefers-reduced-motion` o
 * Motion tira o deslocamento e a escala e sobra a opacidade (a chave `transform` bruta não era
 * coberta, e o diálogo ainda girava).
 */
function DialogContent({
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  transition,
  ...props
}: DialogContentProps) {
  const motion = withTransition(dialogMotion, transition);
  return (
    <DialogPrimitive.Content
      asChild
      forceMount
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onInteractOutside={onInteractOutside}
    >
      <m.div
        key="dialog-content"
        data-slot="dialog-content"
        initial={motion.initial}
        animate={motion.animate}
        exit={motion.exit}
        {...props}
      />
    </DialogPrimitive.Content>
  );
}

type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close>;

function DialogClose(props: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

type DialogHeaderProps = React.ComponentProps<'div'>;

function DialogHeader(props: DialogHeaderProps) {
  return <div data-slot="dialog-header" {...props} />;
}

type DialogFooterProps = React.ComponentProps<'div'>;

function DialogFooter(props: DialogFooterProps) {
  return <div data-slot="dialog-footer" {...props} />;
}

type DialogTitleProps = React.ComponentProps<typeof DialogPrimitive.Title>;

function DialogTitle(props: DialogTitleProps) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

type DialogDescriptionProps = React.ComponentProps<typeof DialogPrimitive.Description>;

function DialogDescription(props: DialogDescriptionProps) {
  return <DialogPrimitive.Description data-slot="dialog-description" {...props} />;
}

export {
  Dialog,
  DialogClose,
  type DialogCloseProps,
  DialogContent,
  type DialogContentProps,
  type DialogContextType,
  DialogDescription,
  type DialogDescriptionProps,
  DialogFooter,
  type DialogFooterProps,
  DialogHeader,
  type DialogHeaderProps,
  DialogOverlay,
  type DialogOverlayProps,
  DialogPortal,
  type DialogPortalProps,
  type DialogProps,
  DialogTitle,
  type DialogTitleProps,
  DialogTrigger,
  type DialogTriggerProps,
  useDialog,
};
