import type { ReactNode } from 'react';
import { FileTextIcon } from '@/components/icons/animated/file-text';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { PageHead } from '@/components/page-head';

/**
 * Página de documento ainda em redação (Termos, Privacidade, Regras, Contato): o título
 * definitivo e uma nota informativa do que vai estar aqui e quando.
 */
export function DraftDocument({
  title,
  status,
  body,
  children,
}: {
  title: string;
  status: string;
  body: string;
  /** O que já vale antes do texto final (ex.: o caminho de recurso nas Regras). */
  children?: ReactNode;
}) {
  return (
    <div className="container-page animate-fade-up pb-16">
      <PageHead title={title} subtitle={status} />
      <div
        data-icon-trigger
        className="grid max-w-[68ch] grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg bg-surface px-4 py-3.5 text-md leading-[1.6]"
      >
        <AnimatedIcon icon={FileTextIcon} size={16} className="mt-1 text-status-info" />
        <p>{body}</p>
      </div>
      {children}
    </div>
  );
}
