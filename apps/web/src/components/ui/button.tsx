import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Botão no padrão do shadcn/ui com a linguagem Liberty: sem borda e sem anel. A ação primária é o
 * preenchido invertido; `ghost` tem fundo em repouso (a escala `--fill-*`: repouso, hover, ativo e
 * foco; o hover só reforça o fundo que já existe) e `quiet`, para ícones e ações terciárias, só ganha
 * fundo no hover. O foco do teclado é um anel fino só no modo teclado (`html[data-kbd]`, ver
 * `globals.css`); mouse e toque nunca o mostram (WCAG 2.4.7 e 1.4.11, medido em `lib/focus-contrast.test.ts`).
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none',
    'transition-[background-color,color,translate,scale] duration-(--dur-fast) ease-std',
    'active:translate-y-px active:scale-[0.985] motion-reduce:active:translate-y-0 motion-reduce:active:scale-100',
    'disabled:pointer-events-none disabled:bg-transparent disabled:text-faint',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        ghost:
          'bg-(--fill-rest) text-foreground hover:bg-(--fill-hover) aria-pressed:bg-(--fill-active) aria-expanded:bg-(--fill-active)',
        quiet:
          'bg-transparent font-medium text-muted-foreground hover:bg-(--fill-hover) hover:text-foreground aria-expanded:bg-(--fill-active) aria-expanded:text-foreground',
      },
      size: {
        default: 'min-h-(--tap) px-4 text-sm',
        sm: 'min-h-8 px-3 text-sm max-md:min-h-(--tap)',
        icon: 'size-(--tap)',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
