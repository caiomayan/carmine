'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import {
  type EndingNotice,
  hiddenOnPath,
  readDismissed,
  VIP_ENDING_ID,
  vipEndingInitScript,
  writeDismissed,
} from '@/lib/vip/ending';

/**
 * A faixa em si (o texto já vem pronto do servidor). Dispensar guarda o dia no localStorage e esconde a faixa; no próximo
 * carregamento um script inline a esconde antes da primeira pintura (sem piscar nem empurrar a página), e numa navegação
 * dentro do site o `useLayoutEffect` faz o mesmo. Sem animação: a faixa só está lá. Nas páginas do VIP e do Loadout, que já
 * falam do assunto, ela não aparece.
 */
export function VipEndingBand({
  notice,
  text,
  link,
  dismiss,
  label,
  nonce,
}: {
  notice: EndingNotice;
  text: string;
  link: string;
  dismiss: string;
  label: string;
  nonce?: string;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const hidden = hiddenOnPath(pathname);

  // Numa navegação dentro do site o script inline não roda de novo: quem dispensou hoje continua sem a faixa.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refaz a conta quando a faixa volta a aparecer (muda a página)
  useLayoutEffect(() => {
    if (ref.current) ref.current.hidden = readDismissed(notice);
  }, [notice, hidden]);

  if (hidden) return null;

  return (
    <>
      <aside
        ref={ref}
        id={VIP_ENDING_ID}
        data-testid="vip-ending"
        data-notice={notice}
        aria-label={label}
        // O script inline pode ter posto `hidden` antes da hidratação: a diferença é esperada.
        suppressHydrationWarning
        className="container-page pt-3"
      >
        <div className="flex items-center gap-3 rounded-xl bg-surface py-2 pr-2 pl-4 text-body-sm max-md:pl-3">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-status-vip" />
          <p className="min-w-0 flex-1">
            {text}{' '}
            <Link
              href={'/plans' as Route}
              prefetch={false}
              data-testid="vip-ending-link"
              className="font-semibold whitespace-nowrap underline underline-offset-4"
            >
              {link}
            </Link>
          </p>
          <button
            type="button"
            aria-label={dismiss}
            data-testid="vip-ending-dismiss"
            onClick={() => {
              writeDismissed(notice);
              if (ref.current) ref.current.hidden = true;
            }}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-(--fill-rest) hover:text-foreground"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m3.5 3.5 9 9m0-9-9 9" />
            </svg>
          </button>
        </div>
      </aside>
      {/* Logo depois da faixa: esconde a dispensada antes da primeira pintura. No cliente vira text/plain (como o ThemeScript):
          o React acusa script executável renderizado por ele, e este já rodou no HTML do servidor. */}
      <script
        nonce={nonce}
        suppressHydrationWarning
        type={typeof window === 'undefined' ? undefined : 'text/plain'}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: string constante, esconde a faixa dispensada antes da primeira pintura
        dangerouslySetInnerHTML={{ __html: vipEndingInitScript }}
      />
    </>
  );
}
