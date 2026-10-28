'use client';

import { ADULT_DECLARATION_VERSION, type VipPackage } from '@carmine/contracts/payments';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import { useSession } from '@/components/session/session-provider';
import { Button } from '@/components/ui/button';
import { type PurchaseErrorCode, purchaseErrorCode } from '@/lib/vip/purchase';

type Method = 'pix' | 'card';

/** O endereço do checkout do cartão só vale se for http(s): nunca `javascript:` vindo de uma resposta. */
function checkoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * A escolha de Pix ou cartão, a declaração de maioridade e o botão de pagar. Cria a compra em `POST /api/me/purchases`
 * (com `Idempotency-Key`: o duplo clique devolve a mesma compra) e leva à página dela; o cartão vai ao checkout do
 * provedor, que volta para `/vip/compra/{id}?retorno=cartao`. A declaração enviada leva a versão do texto que a tela
 * mostrou ({@link ADULT_DECLARATION_VERSION}).
 */
export function PurchaseForm({
  packageId,
  price,
  expiresMinutes,
  demo = false,
}: {
  packageId: VipPackage['id'];
  price: string;
  expiresMinutes: number;
  demo?: boolean;
}) {
  const t = useTranslations('vip.confirm');
  const router = useRouter();
  const { mutate } = useSession();
  const name = useId();
  const [method, setMethod] = useState<Method>('pix');
  const [declared, setDeclared] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<PurchaseErrorCode | 'declaration' | null>(null);
  // Uma chave por tentativa: o duplo clique repete a chave (mesma compra); depois de um erro, nasce outra.
  const key = useRef<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending || demo) return;
    if (!declared) {
      setError('declaration');
      return;
    }
    setError(null);
    setSending(true);
    key.current ??= crypto.randomUUID();
    try {
      const response = await mutate('/api/me/purchases', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key.current },
        body: JSON.stringify({
          package: packageId,
          method,
          adultDeclaration: true,
          declarationVersion: ADULT_DECLARATION_VERSION,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        key.current = null;
        setError(purchaseErrorCode(body));
        setSending(false);
        return;
      }
      const purchase = body as { id: string; redirectUrl?: unknown };
      const checkout = method === 'card' ? checkoutUrl(purchase.redirectUrl) : null;
      if (checkout) window.location.assign(checkout);
      else router.push(`/vip/compra/${purchase.id}` as Route);
      // Segue "enviando" até a página trocar: nada de segundo clique no meio da navegação.
    } catch {
      key.current = null;
      setError('unknown');
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="vc-card vc-form" data-testid="vip-form" noValidate>
      <fieldset className="vc-method">
        <legend className="v-label vc-label">{t('method.legend')}</legend>
        {(['pix', 'card'] as const).map((value) => (
          <label key={value} className="vc-option" data-checked={method === value || undefined}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={method === value}
              onChange={() => setMethod(value)}
              data-testid={`vip-method-${value}`}
            />
            <span className="vc-option-text">
              <b>{t(`method.${value}`)}</b>
              <span>
                {value === 'pix'
                  ? t('method.pixHint', { minutes: expiresMinutes })
                  : t('method.cardHint')}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="vc-declaration">
        <input
          type="checkbox"
          checked={declared}
          onChange={(event) => {
            setDeclared(event.target.checked);
            if (event.target.checked && error === 'declaration') setError(null);
          }}
          aria-describedby={error === 'declaration' ? `${name}-error` : undefined}
          data-testid="vip-declaration"
        />
        <span>{t('declaration.label')}</span>
      </label>

      {error ? (
        <p
          id={`${name}-error`}
          role="alert"
          className="vc-error"
          data-testid="vip-form-error"
          data-code={error}
        >
          {error === 'declaration' ? t('declaration.required') : t(`errors.${error}`)}
        </p>
      ) : null}

      <Button type="submit" disabled={sending} className="vc-submit" data-testid="vip-submit">
        {sending ? t('submitting') : t('submit', { price })}
      </Button>
    </form>
  );
}
