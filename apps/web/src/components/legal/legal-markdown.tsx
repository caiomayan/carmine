import type { Route } from 'next';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GAP_HREF, headingAnchor } from '@/lib/legal/document';
import { cn } from '@/lib/utils';

/** Texto puro de um nó do markdown (o título vira âncora). */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return '';
}

/** A âncora do título e o que mostrar: o próprio título, ou só o texto quando ele fixa a âncora (`{#id}`). */
function anchored(children: ReactNode): { id: string; content: ReactNode } {
  const raw = textOf(children);
  const { id, text } = headingAnchor(raw);
  return { id, content: text === raw.trim() ? children : text };
}

const linkClass =
  'font-medium text-foreground underline decoration-line-strong underline-offset-(--underline-offset) transition-[text-decoration-color] duration-(--dur-fast) ease-std hover:decoration-foreground [overflow-wrap:anywhere]';

function DocLink({ href = '', children, gapLabel }: ComponentProps<'a'> & { gapLabel: string }) {
  // Lacuna do dono num rascunho: pendência destacada, não um link.
  if (href === GAP_HREF) {
    return (
      <mark
        data-testid="legal-gap"
        className="relative rounded-xs bg-status-warn/18 px-1 py-px font-medium text-foreground [box-decoration-break:clone]"
      >
        <span className="sr-only">{gapLabel}: </span>
        {children}
      </mark>
    );
  }
  if (href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link href={href as Route} className={linkClass}>
        {children}
      </Link>
    );
  }
  if (href.startsWith('#')) {
    return (
      <a href={href} className={linkClass}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

function componentsFor(gapLabel: string): Components {
  return {
    h1: ({ children }) => <h2 className="mt-12 text-lg font-semibold">{children}</h2>,
    h2: ({ children }) => {
      const { id, content } = anchored(children);
      return (
        <h2
          id={id}
          className="mt-12 scroll-mt-6 text-lg font-semibold tracking-[-0.01em] text-balance first:mt-0"
        >
          {content}
        </h2>
      );
    },
    h3: ({ children }) => {
      const { id, content } = anchored(children);
      return (
        <h3 id={id} className="mt-8 scroll-mt-6 text-md font-semibold text-balance">
          {content}
        </h3>
      );
    },
    p: ({ children }) => <p className="mt-3 text-md leading-[1.7] text-pretty">{children}</p>,
    ul: ({ children }) => (
      <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-md leading-[1.65] marker:text-line-strong">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-md leading-[1.65] marker:font-semibold marker:text-muted-foreground">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    a: (props) => <DocLink {...props} gapLabel={gapLabel} />,
    code: ({ children }) => (
      <code className="rounded-sm bg-surface-2 px-1 py-px text-[0.92em] font-semibold">
        {children}
      </code>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mt-4 rounded-lg bg-surface px-4 py-1 pb-3 text-muted-foreground">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-10 border-line" />,
    // Tabela larga rola dentro do próprio bloco, nunca a página (390 px sem scroll horizontal).
    table: ({ children }) => (
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a área rolável precisa receber foco para rolar pelo teclado.
      <div className="relative -mx-1 mt-5 overflow-x-auto px-1 pb-1" tabIndex={0}>
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="text-muted-foreground">{children}</thead>,
    th: ({ children }) => (
      <th className="border-b border-line px-3 py-2 align-bottom text-xs font-semibold first:pl-0">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-line/60 px-3 py-2.5 align-top leading-[1.5] first:pl-0 first:font-medium">
        {children}
      </td>
    ),
  };
}

/** O corpo de um documento legal, no desenho da Liberty (sem HTML cru: o markdown é só texto). */
export function LegalMarkdown({
  body,
  gapLabel,
  className,
}: {
  body: string;
  /** Rótulo para leitor de tela das lacunas do dono ("Pendência"). */
  gapLabel: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 max-w-[70ch]', className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={componentsFor(gapLabel)} skipHtml>
        {body}
      </Markdown>
    </div>
  );
}
