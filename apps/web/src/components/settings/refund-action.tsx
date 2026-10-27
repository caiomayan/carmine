'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSession } from '@/components/session/session-provider';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** Os códigos de erro do reembolso que a tela tem frase própria para (o resto vira a frase genérica). */
const KNOWN_ERRORS = ['refund_unavailable', 'not_found', 'provider_unavailable'] as const;
type RefundError = (typeof KNOWN_ERRORS)[number] | 'generic';
const isKnown = (code: string): code is (typeof KNOWN_ERRORS)[number] =>
  (KNOWN_ERRORS as readonly string[]).includes(code);

/**
 * "Pedir reembolso" (direito de arrependimento de 7 dias, automático pelo site): pergunta antes, porque
 * não tem volta, e pede o estorno à API. O navegador não valida a resposta (sem o Zod): só lê o código do
 * erro, se houver. No sucesso a página é relida e a compra aparece como reembolsada.
 */
export function RefundAction({
  id,
  amount,
  days,
  until,
}: {
  id: string;
  /** O valor já formatado ("R$ 9,90"). */
  amount: string;
  days: number;
  /** Até quando o botão vale, já formatado. */
  until: string;
}) {
  const t = useTranslations('settings.purchases.refund');
  const { mutate } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RefundError | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const response = await mutate(`/api/me/purchases/${id}/refund`, { method: 'POST' });
      if (response.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const code =
        typeof body === 'object' && body !== null && 'code' in body ? String(body.code) : '';
      setError(isKnown(code) ? code : 'generic');
    } catch {
      setError('generic');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="refund-open"
      >
        {t('open')}
        <span className="font-normal text-muted-foreground">{t('until', { date: until })}</span>
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('title')}
        description={
          <>
            <p>{t('body', { amount, days })}</p>
            {error === null ? null : (
              <p role="alert" className="mt-3 text-status-danger" data-testid="refund-error">
                {t(`errors.${error}`)}
              </p>
            )}
          </>
        }
        confirmLabel={t('confirm')}
        onConfirm={() => void confirm()}
        pending={pending}
        testId="refund-dialog"
      />
    </>
  );
}
