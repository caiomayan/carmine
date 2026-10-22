'use client';

import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode, type Ref, useId, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Campo de texto padrão da Carmine, no estilo "Label Input" (spell.sh), adaptado à Liberty:
 * - **rótulo flutuante**: dentro do campo, grande, enquanto está vazio; ao focar ou ter texto, sobe e
 *   encolhe para o alto do campo (transição curta, sem animação com movimento reduzido). É um
 *   `<label for>` de verdade, então o nome acessível é o rótulo e o placeholder fica em branco;
 * - **fundo de superfície** (sem borda), que clareia no hover; no foco o campo ganha um anel fino com a
 *   cor da marca (`--focus-ring`, 3:1 nos dois temas), a exceção da regra de fundos que o dono
 *   permitiu para campos de texto. Com erro, o anel e o ponto vão para o `--status-danger`;
 * - **dica e erro** embaixo (ligados por `aria-describedby`) e um contador opcional (`aside`) no canto;
 * - **mostrar/ocultar a senha** quando `type="password"`.
 *
 * Buscas (Ctrl+K, catálogo, listas com busca) não usam este campo: mantêm a lupa.
 */
type LabelFieldProps = {
  id?: string;
  label: ReactNode;
  /** Dica sob o campo (some enquanto houver erro). */
  hint?: ReactNode;
  error?: ReactNode;
  /** Texto pequeno no canto (ex.: "3/24"). */
  aside?: ReactNode;
  containerClassName?: string;
  /** Textos do botão de senha (padrão em PT-BR). */
  showLabel?: string;
  hideLabel?: string;
};

// As classes ficam escritas por extenso: o Tailwind só gera o que acha no código-fonte.
// `peer-[:placeholder-shown:not(:focus)]` é o campo vazio e sem foco, onde o rótulo repousa dentro dele.
const FIELD =
  'peer block min-h-(--tap) w-full rounded-md bg-(--fill-rest) px-3 pt-5 pb-1.5 text-body text-foreground outline-2 outline-transparent transition-[background-color,outline-color] duration-(--dur-fast) ease-std placeholder:text-transparent focus:placeholder:text-muted-foreground hover:bg-(--fill-hover) focus:outline-(--focus-ring) disabled:text-faint disabled:hover:bg-(--fill-rest) aria-invalid:outline-status-danger aria-invalid:focus:outline-status-danger motion-reduce:transition-none';

const LABEL =
  'pointer-events-none absolute left-3 max-w-[calc(100%-1.5rem)] origin-top-left truncate text-body text-muted-foreground peer-focus:text-foreground peer-disabled:text-faint motion-reduce:transition-none';

/** Uma linha: flutua para o alto (com texto ou foco) e repousa no meio do campo vazio. */
const LABEL_LINE = `${LABEL} top-1/2 -translate-y-[calc(50%+9px)] scale-[.78] transition-[translate,scale,color] duration-(--dur-fast) ease-std peer-[:placeholder-shown:not(:focus)]:-translate-y-1/2 peer-[:placeholder-shown:not(:focus)]:scale-100`;

/** Texto longo: repousa na altura da primeira linha e flutua para o alto. */
const LABEL_AREA = `${LABEL} top-5 -translate-y-3.5 scale-[.78] transition-[translate,scale,color] duration-(--dur-fast) ease-std peer-[:placeholder-shown:not(:focus)]:translate-y-0 peer-[:placeholder-shown:not(:focus)]:scale-100`;

function Message({ id, error, hint }: { id: string; error?: ReactNode; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="flex items-start gap-1.5 text-body-sm text-foreground">
        <span
          aria-hidden="true"
          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
        />
        {error}
      </p>
    );
  }
  return hint ? (
    <p id={`${id}-hint`} className="text-body-sm text-muted-foreground">
      {hint}
    </p>
  ) : null;
}

/** Une o `aria-describedby` do chamador com a dica ou o erro do campo. */
function describedBy(id: string, extra: string | undefined, error: ReactNode, hint: ReactNode) {
  const own = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return [extra, own].filter(Boolean).join(' ') || undefined;
}

export function LabelInput({
  id: idProp,
  label,
  hint,
  error,
  aside,
  containerClassName,
  className,
  type = 'text',
  placeholder = ' ',
  showLabel = 'Mostrar a senha',
  hideLabel = 'Ocultar a senha',
  ref,
  'aria-invalid': invalid,
  'aria-describedby': describedByProp,
  ...props
}: LabelFieldProps & Omit<ComponentProps<'input'>, 'id'> & { ref?: Ref<HTMLInputElement> }) {
  const generated = useId();
  const id = idProp ?? generated;
  const [visible, setVisible] = useState(false);
  const password = type === 'password';

  return (
    <div className={cn('grid content-start gap-1.5', containerClassName)}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={password && visible ? 'text' : type}
          // O placeholder (por padrão um espaço) é o que faz o `:placeholder-shown` valer: o rótulo repousa
          // enquanto o campo está vazio. Um placeholder de verdade só aparece com o campo em foco.
          placeholder={placeholder}
          data-label-input=""
          aria-invalid={error ? true : invalid}
          aria-describedby={describedBy(id, describedByProp, error, hint)}
          className={cn(FIELD, password && 'pr-11', className)}
          {...props}
        />
        <label htmlFor={id} className={LABEL_LINE}>
          {label}
        </label>
        {aside ? (
          <span className="pointer-events-none absolute top-1.5 right-3 text-caption text-muted-foreground tabular-nums">
            {aside}
          </span>
        ) : null}
        {password ? (
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? hideLabel : showLabel}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:text-foreground motion-reduce:transition-none"
          >
            {visible ? (
              <EyeOffIcon size={16} aria-hidden="true" />
            ) : (
              <EyeIcon size={16} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}

/** O mesmo campo para texto longo (motivo, anotações): o rótulo sobe do mesmo jeito. */
export function LabelTextarea({
  id: idProp,
  label,
  hint,
  error,
  aside,
  containerClassName,
  className,
  placeholder = ' ',
  ref,
  'aria-invalid': invalid,
  'aria-describedby': describedByProp,
  ...props
}: LabelFieldProps & Omit<ComponentProps<'textarea'>, 'id'> & { ref?: Ref<HTMLTextAreaElement> }) {
  const generated = useId();
  const id = idProp ?? generated;

  return (
    <div className={cn('grid content-start gap-1.5', containerClassName)}>
      <div className="relative">
        <textarea
          ref={ref}
          id={id}
          placeholder={placeholder}
          data-label-input=""
          aria-invalid={error ? true : invalid}
          aria-describedby={describedBy(id, describedByProp, error, hint)}
          className={cn(FIELD, 'min-h-24 resize-y leading-[1.5]', className)}
          {...props}
        />
        <label htmlFor={id} className={LABEL_AREA}>
          {label}
        </label>
        {aside ? (
          <span className="pointer-events-none absolute top-1.5 right-3 text-caption text-muted-foreground tabular-nums">
            {aside}
          </span>
        ) : null}
      </div>
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}
