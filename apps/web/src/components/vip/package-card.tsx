import type { VipPackage } from '@carmine/contracts/payments';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { signInHref } from '@/lib/auth-links';
import { cn } from '@/lib/utils';
import {
  type BuyState,
  formatBrl,
  perMonthCents,
  purchaseHref,
  savingsPercent,
} from '@/lib/vip/packages';

/**
 * Um Pacote VIP: quantos meses, o preço, o preço por mês, quanto economiza e o botão. O botão depende do estado da
 * compra: abre a confirmação, leva à Steam (visitante), fica parado em "Em breve" (cobrança desligada) ou travado
 * quando a Conta não pode comprar (o motivo está no aviso acima dos Pacotes).
 */
export function PackageCard({
  pack,
  packages,
  best,
  state,
  index,
}: {
  pack: VipPackage;
  packages: readonly VipPackage[];
  best: boolean;
  state: BuyState;
  index: number;
}) {
  const t = useTranslations('vip.packages');
  const saving = savingsPercent(pack, packages);
  const price = formatBrl(pack.priceCents);

  return (
    <li
      data-testid="vip-package"
      data-package={pack.id}
      data-best={best || undefined}
      style={{ '--i': index } as React.CSSProperties}
      className={cn('vp-card enter-stagger', best && 'vp-card-best')}
    >
      <div className="vp-card-top">
        <p className="vp-months v-sign">{t('months', { months: pack.months })}</p>
        <span className="vp-tags">
          {best ? <span className="vp-tag vp-tag-best">{t('best')}</span> : null}
          {saving > 0 ? <span className="vp-tag">{t('save', { percent: saving })}</span> : null}
        </span>
      </div>

      <p className="vp-price v-serif tabular-nums" data-testid="vip-price">
        {price}
      </p>
      <p className="vp-sub">
        <span className="tabular-nums">
          {t('perMonth', { price: formatBrl(perMonthCents(pack)) })}
        </span>
        <span aria-hidden="true"> · </span>
        <span className="tabular-nums">{t('days', { days: pack.days })}</span>
      </p>

      <BuyButton pack={pack} state={state} price={price} />
    </li>
  );
}

function BuyButton({ pack, state, price }: { pack: VipPackage; state: BuyState; price: string }) {
  const t = useTranslations('vip.packages');
  if (state.kind === 'buy') {
    return (
      <Button asChild className="vp-buy" data-testid="vip-buy">
        <Link
          href={purchaseHref(pack.id) as never}
          aria-label={t('buyAria', { months: pack.months, price })}
        >
          {t('buy')}
        </Link>
      </Button>
    );
  }
  if (state.kind === 'signin') {
    return (
      <Button asChild className="vp-buy" data-testid="vip-signin">
        <Link href={signInHref(purchaseHref(pack.id)) as never}>{t('signIn')}</Link>
      </Button>
    );
  }
  // "Em breve" (cobrança desligada) e as Contas que não podem comprar: um botão parado, sem link. O motivo de quem
  // não pode comprar está no aviso da página.
  return (
    <Button disabled className="vp-buy" data-testid="vip-disabled">
      {state.kind === 'soon' ? t('soon') : t('buy')}
    </Button>
  );
}
