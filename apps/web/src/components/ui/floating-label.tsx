import type { ReactNode } from 'react';

/**
 * A linguagem do Label Input (`label-input.tsx`) para os botões de Select e Combobox de formulário:
 * fundo `--fill-*`, rótulo flutuante e o mesmo anel fino da marca no foco (e enquanto a lista está
 * aberta). O botão leva `peer` e o rótulo vem depois, como irmão: com um valor escolhido o rótulo fica
 * no alto; sem valor (o botão traz `data-placeholder`) ele repousa dentro do campo, até o foco ou a
 * abertura. Os filtros de listagem (catálogo, Ranking, Modo) não usam isto: ficam como estão.
 *
 * As classes ficam por extenso: o Tailwind só gera o que acha no código-fonte.
 */

/** Cor do rótulo e do contador: 80% do texto, 4,5:1 sobre o campo em repouso, hover e foco. */
export const LABEL_COLOR = '[--label-color:color-mix(in_srgb,var(--text)_80%,transparent)]';

export const fieldTriggerClass = [
  'group peer relative flex min-h-(--tap) w-full items-center justify-between gap-2 rounded-md bg-(--fill-rest) px-3 pt-5 pb-1.5 text-left text-body text-foreground outline-2 outline-offset-0 outline-transparent transition-[background-color,outline-color] duration-(--dur-fast) ease-std motion-reduce:transition-none',
  'hover:bg-(--fill-hover) focus:bg-(--fill-focus) focus:outline-(--focus-ring) data-[state=open]:bg-(--fill-focus) data-[state=open]:outline-(--focus-ring)',
  'disabled:pointer-events-none disabled:text-faint aria-invalid:outline-status-danger aria-invalid:focus:outline-status-danger',
  '*:data-[slot=select-value]:truncate [&_svg]:pointer-events-none [&_svg]:shrink-0',
].join(' ');

const FLOATING =
  'pointer-events-none absolute top-1/2 left-3 max-w-[calc((100%-2.5rem)/.78)] origin-top-left -translate-y-[calc(50%+9px)] scale-[.78] truncate text-body text-(--label-color) transition-[translate,scale,color] duration-(--dur-fast) ease-std peer-focus:text-foreground peer-data-[state=open]:text-foreground peer-disabled:text-faint motion-reduce:transition-none peer-[[data-placeholder]:not(:focus):not([data-state=open])]:max-w-[calc(100%-3rem)] peer-[[data-placeholder]:not(:focus):not([data-state=open])]:-translate-y-1/2 peer-[[data-placeholder]:not(:focus):not([data-state=open])]:scale-100';

/** O rótulo do botão de Select/Combobox: precisa vir logo depois do botão (que leva `peer`). */
export function FloatingLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={FLOATING}>
      {children}
    </label>
  );
}
