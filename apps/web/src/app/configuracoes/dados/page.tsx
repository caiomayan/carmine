import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';

/**
 * Configurações > Dados e conta. Ainda não há exportação nem exclusão pelo site: o pedido segue o
 * canal de Contato (em preparação), então a seção diz isso e leva até ele, sem botões que não
 * fazem nada.
 */
export default async function DataSettingsPage() {
  const t = await getTranslations('settings.data');
  return (
    <SettingsSection section="dados">
      <div className="grid gap-3 rounded-lg px-4 py-3 max-md:px-3" data-testid="data-request">
        <div className="grid gap-0.5">
          <h3 className="text-[14px] font-semibold">{t('requestTitle')}</h3>
          <p className="max-w-[60ch] text-[13px] text-muted-foreground">{t('requestBody')}</p>
        </div>
        <div>
          <Button asChild variant="ghost" size="sm" className="bg-surface-2 hover:bg-line">
            <Link href={'/contato' as Route}>{t('contact')}</Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-3 rounded-lg px-4 py-3 max-md:px-3">
        <div className="grid gap-0.5">
          <h3 className="text-[14px] font-semibold">{t('privacyTitle')}</h3>
          <p className="max-w-[60ch] text-[13px] text-muted-foreground">{t('privacyBody')}</p>
        </div>
        <div>
          <Button asChild variant="ghost" size="sm" className="bg-surface-2 hover:bg-line">
            <Link href={'/privacidade' as Route}>{t('privacy')}</Link>
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
