import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SectionTitle } from '@/components/section-title';
import type { SettingsSection as Section } from '@/lib/settings-nav';

/** O bloco de uma seção de Configurações: título com ◆, uma linha de apoio e os ajustes. */
export async function SettingsSection({
  section,
  children,
}: {
  section: Section;
  children: ReactNode;
}) {
  const t = await getTranslations('settings.sections');
  const titleId = `secao-${section}`;
  return (
    <section
      aria-labelledby={titleId}
      data-testid={`settings-${section}`}
      className="animate-fade-up"
    >
      <SectionTitle id={titleId}>{t(`${section}.title`)}</SectionTitle>
      <p className="-mt-1 mb-4 max-w-[60ch] text-[13px] text-muted-foreground">
        {t(`${section}.intro`)}
      </p>
      <div className="grid gap-1 rounded-xl bg-surface p-2 max-md:p-1">{children}</div>
    </section>
  );
}
