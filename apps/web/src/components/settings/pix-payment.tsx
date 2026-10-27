'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CopyButton } from './copy-button';

/** "24:10": minutos e segundos que faltam, sempre com dois dígitos nos segundos. */
function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * O Pix de uma compra pendente (recuperável em "Minhas compras", como a spec pede): o QR, o código
 * "copia e cola" e quanto falta para o QR vencer. A contagem só aparece depois de montar (o servidor e
 * o navegador não têm o mesmo relógio) e, no zero, pede a releitura da página, que mostra a compra
 * como expirada.
 */
export function PixPayment({
  code,
  qrBase64,
  expiresAt,
}: {
  code: string;
  qrBase64: string | null;
  expiresAt: string | null;
}) {
  const t = useTranslations('settings.purchases.pix');
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (expiresAt === null) return;
    const end = new Date(expiresAt).getTime();
    let done = false;
    const tick = () => {
      const remaining = Math.max(0, end - Date.now());
      setLeft(remaining);
      if (remaining === 0 && !done) {
        done = true;
        router.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, router]);

  return (
    <div
      className="grid gap-4 rounded-lg bg-(--fill-rest) p-4 min-[560px]:grid-cols-[auto_minmax(0,1fr)] min-[560px]:items-center"
      data-testid="pix-payment"
    >
      {qrBase64 ? (
        // O QR é um PNG em base64 que o provedor devolve: não passa por otimização nem por rede.
        // biome-ignore lint/performance/noImgElement: data URI pequeno, o next/image não ganharia nada.
        <img
          src={`data:image/png;base64,${qrBase64}`}
          alt={t('qrAlt')}
          width={168}
          height={168}
          className="size-[168px] justify-self-center rounded-md bg-white p-2"
          data-testid="pix-qr"
        />
      ) : null}
      <div className="grid min-w-0 gap-3">
        <div className="grid gap-1">
          <p className="text-body-sm font-semibold">{t('title')}</p>
          <p className="text-body-sm text-muted-foreground">{t('hint')}</p>
        </div>
        <div className="grid gap-1">
          <span className="text-caption text-muted-foreground">{t('code')}</span>
          <code
            className="max-h-[4.5rem] overflow-hidden break-all rounded-md bg-surface-2 px-3 py-2 text-caption select-all"
            data-testid="pix-code"
          >
            {code}
          </code>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <CopyButton
            text={code}
            label={t('copy')}
            copiedLabel={t('copied')}
            failedLabel={t('copyFailed')}
            testId="pix-copy"
          />
          {left === null ? null : (
            <span
              className="text-caption text-muted-foreground tabular-nums"
              data-testid="pix-countdown"
            >
              {left === 0 ? t('expired') : t('expiresIn', { time: clock(left) })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
