import { staffCan } from '@carmine/contracts/staff';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MainNav, type NavItem } from '@/components/main-nav';
import { PageHead } from '@/components/page-head';
import { getServerSession } from '@/lib/api-server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('staff');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Painel da Staff (S07): só para Contas com papel de Staff; para todo o resto (visitante,
 * jogador, API fora) é a página 404, sem revelar que o painel existe. Ferramenta de trabalho:
 * denso e sóbrio, com as abas que o papel permite.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const server = await getServerSession();
  const role = server.status === 'authenticated' ? server.session.staffRole : null;
  if (!role) notFound();

  const t = await getTranslations('staff');
  const { common, staff, moderation, ranking } = await getMessages();
  const items: NavItem[] = [{ href: '/staff', label: t('nav.accounts') }];
  if (staffCan(role, 'reports.handle')) {
    items.push({ href: '/staff/denuncias', label: t('nav.reports') });
  }
  if (staffCan(role, 'avatars.moderate'))
    items.push({ href: '/staff/fotos', label: t('nav.photos') });
  if (staffCan(role, 'payments.manage')) {
    items.push({ href: '/staff/pagamentos', label: t('nav.payments') });
  }
  if (staffCan(role, 'audit.read')) items.push({ href: '/staff/auditoria', label: t('nav.audit') });
  if (staffCan(role, 'servers.edit')) {
    items.push({ href: '/staff/servidores', label: t('nav.servers') });
  }

  return (
    <div className="container-page pb-16" data-testid="staff-panel" data-role={role}>
      <PageHead
        className="animate-fade-up pb-4"
        title={t('title')}
        subtitle={t('subtitle', { role: t(`roles.${role}`) })}
      />
      {items.length > 1 ? (
        <MainNav
          label={t('nav.label')}
          items={items}
          className="-mx-3 mb-6 animate-fade-up overflow-x-auto [animation-delay:40ms]"
        />
      ) : null}
      <NextIntlClientProvider messages={{ common, staff, moderation, ranking }}>
        {children}
      </NextIntlClientProvider>
    </div>
  );
}
