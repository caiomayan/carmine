'use client';

import { CheckIcon } from '@/components/icons/animated/check';
import { CopyIcon } from '@/components/icons/animated/copy';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { useCopy } from '@/components/servers/use-copy';
import { Button } from '@/components/ui/button';

/**
 * Botão de copiar com o resultado dito em palavras (e lido pelo leitor de tela): o texto copiado, o rótulo e as
 * duas frases de resultado vêm prontos do servidor.
 */
export function CopyButton({
  text,
  label,
  copiedLabel,
  failedLabel,
  testId,
  variant = 'ghost',
}: {
  text: string;
  label: string;
  copiedLabel: string;
  failedLabel: string;
  testId?: string;
  variant?: 'ghost' | 'quiet';
}) {
  const { status, copy } = useCopy();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        variant={variant}
        size="sm"
        onClick={() => void copy(text)}
        data-testid={testId}
        className="data-[copied=true]:text-status-success"
        data-copied={status === 'copied'}
      >
        {status === 'copied' ? (
          <AnimatedIcon icon={CheckIcon} size={15} />
        ) : (
          <AnimatedIcon icon={CopyIcon} size={15} />
        )}
        {status === 'copied' ? copiedLabel : label}
      </Button>
      <span role="status" className="text-caption text-muted-foreground">
        {status === 'failed' ? failedLabel : ''}
      </span>
    </span>
  );
}
