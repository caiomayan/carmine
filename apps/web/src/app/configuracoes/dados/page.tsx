import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AnalyticsSetting } from '@/components/settings/analytics-setting';
import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { getAnalyticsPreference } from '@/lib/api-server';

/**
 * Configurações > Dados e conta: a chave "Participar da análise de uso" (A1d, quando há análise ligada) e, como ainda não há exportação nem exclusão pelo site: o pedido segue o
 * canal de Contato (em preparação), então a seção diz isso e leva até ele, sem botões que não
 * fazem nada.
 */
export default async function DataSettingsPage() {
  const t = await getTranslations('settings.data');
  const analytics = await getAnalyticsPreference();
  return (
    <SettingsSection section="dados">
      {/* Só com a análise ligada neste ambiente: desligada, não há o que escolher. */}
      {analytics.status === 'ok' && analytics.data.enabled ? (
        <AnalyticsSetting participate={analytics.data.participate} />
      ) : null}
      <Block
        title={t('requestTitle')}
        body={t('requestBody')}
        href="/contato"
        action={t('contact')}
        testId="data-request"
      />
      <Block
        title={t('privacyTitle')}
        body={t('privacyBody')}
        href="/privacidade"
        action={t('privacy')}
      />
    </SettingsSection>
  );
}

function Block({
  title,
  body,
  href,
  action,
  testId,
}: {
  title: string;
  body: string;
  href: Route;
  action: string;
  testId?: string;
}) {
  return (
    <div className="grid gap-3 rounded-lg px-4 py-3 max-md:px-3" data-testid={testId}>
      <div className="grid gap-0.5">
        <h3 className="text-body font-semibold">{title}</h3>
        <p className="max-w-[60ch] text-body-sm text-muted-foreground">{body}</p>
      </div>
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href={href}>{action}</Link>
        </Button>
      </div>
    </div>
  );
}
