'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ENCRYPTED_FLIP_MS,
  type EncryptedChar,
  encryptedFrame,
  revealedCount,
  revealStepMs,
} from '@/lib/encrypted-text';
import { cn } from '@/lib/utils';

/** Os `onceKey` que já decifraram nesta carga da página: reabrir o Dialog não repete o efeito. */
const played = new Set<string>();

type Phase = 'pending' | 'rest' | 'run';

/**
 * Texto que decifra, da esquerda para a direita, a partir de letras embaralhadas (adaptado do
 * Encrypted Text do Aceternity UI). O texto final está sempre no DOM: parado, ele é o próprio
 * conteúdo; durante o efeito, vai num `sr-only` e as letras embaralhadas ficam em `aria-hidden`,
 * então o leitor de tela lê o texto final e nunca o lixo. Cada letra reserva a largura da final
 * (a embaralhada fica por cima, absoluta), e o texto não pula nem quebra de linha diferente.
 *
 * - `onMount` (padrão `true`): decifra ao montar; uma função decide no cliente, antes da 1ª
 *   pintura (ex.: "só na primeira visita depois da virada"). Antes da hidratação o texto fica
 *   invisível (o servidor já o traz no HTML) e, sem JS, aparece sozinho depois de 1,5 s
 *   (`.encrypted-pending`). Com `false` ele nasce parado.
 * - `onChange` (padrão `false`): decifra também quando `text` muda depois de montado.
 * - `onceKey`: decifra só na primeira vez que esse texto aparece na página.
 * - `prefers-reduced-motion: reduce`: aparece direto, sem embaralhar.
 */
export function EncryptedText({
  text,
  onMount = true,
  onChange = false,
  onceKey,
  className,
  encryptedClassName = 'text-muted-foreground',
}: {
  text: string;
  onMount?: boolean | (() => boolean);
  onChange?: boolean;
  onceKey?: string;
  className?: string;
  /** A classe das letras que ainda não se revelaram. */
  encryptedClassName?: string;
}) {
  const [phase, setPhase] = useState<Phase>(onMount === false ? 'rest' : 'pending');
  const [frame, setFrame] = useState<EncryptedChar[]>([]);
  // Lidos só no momento de começar; trocar a função ou a chave não reinicia o efeito.
  const options = useRef({ onMount, onChange, onceKey });
  options.current = { onMount, onChange, onceKey };
  const previous = useRef<string | null>(null);

  // Quando começa: ao montar (se `onMount` deixar) ou quando o texto muda (se `onChange` deixar).
  useLayoutEffect(() => {
    const mounting = previous.current === null;
    if (!mounting && previous.current === text) return;
    previous.current = text;
    const { onMount, onChange, onceKey } = options.current;
    const wanted = mounting ? (typeof onMount === 'function' ? onMount() : onMount) : onChange;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      !wanted ||
      reduce ||
      text === '' ||
      (onceKey !== undefined && played.has(`${onceKey}:${text}`))
    ) {
      setPhase('rest');
      return;
    }
    setFrame(encryptedFrame(text, 0));
    setPhase('run');
  }, [text]);

  // O relógio do efeito: um quadro novo a cada troca de letras, até revelar tudo.
  useEffect(() => {
    if (phase !== 'run') return;
    const length = Array.from(text).length;
    const step = revealStepMs(length);
    const start = performance.now();
    let last = start;
    let id = 0;
    const tick = (now: number) => {
      const revealed = revealedCount(now - start, length, step);
      if (revealed >= length) {
        if (onceKey !== undefined) played.add(`${onceKey}:${text}`);
        setPhase('rest');
        return;
      }
      if (now - last >= ENCRYPTED_FLIP_MS) {
        last = now;
        setFrame(encryptedFrame(text, revealed));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [phase, text, onceKey]);

  if (phase !== 'run') {
    return (
      <span
        data-encrypted={phase}
        className={cn(phase === 'pending' && 'encrypted-pending', className)}
      >
        {text}
      </span>
    );
  }

  // Palavra a palavra, para a quebra de linha ficar nos espaços como no texto parado.
  const words: EncryptedChar[][] = [[]];
  for (const entry of frame) {
    if (entry.original === ' ') words.push([]);
    else words[words.length - 1]?.push(entry);
  }

  return (
    <span data-encrypted="run" className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, wordIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: as palavras são fixas durante o efeito
          <span key={wordIndex}>
            {wordIndex > 0 ? ' ' : null}
            <span className="inline-block whitespace-nowrap">
              {word.map((entry, index) =>
                entry.revealed ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: as letras são fixas durante o efeito
                  <span key={index} className="inline-block">
                    {entry.original}
                  </span>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: as letras são fixas durante o efeito
                  <span key={index} className="relative inline-block">
                    <span className="invisible">{entry.original}</span>
                    <span className={cn('absolute inset-0 text-center', encryptedClassName)}>
                      {entry.char}
                    </span>
                  </span>
                ),
              )}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
