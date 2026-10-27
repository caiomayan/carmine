import type { Purchase } from '@carmine/contracts/payments';
import type { Route } from 'next';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { BadgeAlertIcon } from '@/components/icons/animated/badge-alert';
import { BoxIcon } from '@/components/icons/animated/box';
import { PurchaseCard } from '@/components/settings/purchase-card';
import { PurchasesWatcher } from '@/components/settings/purchases-watcher';
import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { getPurchase, getPurchases, getVipPackages } from '@/lib/api-server';
import { isOpen } from '@/lib/purchases';

/**
 * Configurações > Compras (S14b): as compras de Pacote VIP da Conta, da mais nova, com o estado de cada
 * uma mesmo depois de fechar a página (o Pix pendente volta com o QR). O que está em aberto é lido de
 * novo no detalhe, que pergunta ao provedor, e a página se atualiza sozinha até o pagamento resolver.
 */
export default async function PurchasesPage() {
  const t = await getTranslations('settings.purchases');
  const { common, settings } = await getMessages();
  const [result, packages] = await Promise.all([getPurchases(), getVipPackages()]);

  if (result.status !== 'ok') {
    return (
      <SettingsSection section="compras">
        <div data-testid="purchases-unavailable">
          <EmptyState
            icon={BadgeAlertIcon}
            title={t('unavailable.title')}
            body={t('unavailable.body')}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href={'/configuracoes/compras' as Route}>{t('unavailable.retry')}</Link>
              </Button>
            }
          />
        </div>
      </SettingsSection>
    );
  }

  // As em aberto vêm do detalhe (a API consulta o provedor); se a leitura falhar, vale a da lista.
  const purchases: Purchase[] = await Promise.all(
    result.data.map(async (purchase) => {
      if (!isOpen(purchase.status)) return purchase;
      const detail = await getPurchase(purchase.id);
      return detail.status === 'ok' ? detail.purchase : purchase;
    }),
  );
  const now = new Date();

  return (
    <SettingsSection section="compras">
      <NextIntlClientProvider
        messages={{
          common: { close: common.close, cancel: common.cancel },
          settings: { purchases: settings.purchases },
        }}
      >
        {packages?.sandbox ? (
          <p
            className="mx-2 rounded-lg bg-(--fill-rest) px-4 py-3 text-body-sm text-muted-foreground max-md:mx-1"
            data-testid="purchases-sandbox"
          >
            {t('sandbox')}
          </p>
        ) : null}
        {purchases.length === 0 ? (
          <div data-testid="purchases-empty">
            <EmptyState icon={BoxIcon} title={t('empty.title')} body={t('empty.body')} />
          </div>
        ) : (
          <div className="grid gap-2" data-testid="purchases-list">
            {purchases.map((purchase) => (
              <PurchaseCard key={purchase.id} purchase={purchase} now={now} />
            ))}
          </div>
        )}
        <PurchasesWatcher active={purchases.some((purchase) => isOpen(purchase.status))} />
      </NextIntlClientProvider>
    </SettingsSection>
  );
}
