import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { ComponentGallery } from '@/components/component-gallery';
import { PageHead } from '@/components/page-head';

// A vitrine só existe com CARMINE_UI_GALLERY=1 (dev e E2E); em produção é 404.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('gallery');
  return { title: t('title'), robots: { index: false } };
}

export default async function GalleryPage() {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const t = await getTranslations('gallery');
  const close = (await getTranslations('common'))('close');
  const { common } = await getMessages();

  return (
    <div className="container-page animate-fade-up">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <NextIntlClientProvider messages={{ common }}>
        <ComponentGallery
          labels={{
            close,
            buttons: {
              title: t('buttons.title'),
              primary: t('buttons.primary'),
              ghost: t('buttons.ghost'),
              quiet: t('buttons.quiet'),
              disabled: t('buttons.disabled'),
            },
            switch: { title: t('switch.title'), label: t('switch.label') },
            menu: {
              title: t('menu.title'),
              open: t('menu.open'),
              heading: t('menu.heading'),
              items: [t('menu.items.retake'), t('menu.items.deathmatch'), t('menu.items.all')],
            },
            dialog: {
              title: t('dialog.title'),
              open: t('dialog.open'),
              heading: t('dialog.heading'),
              body: t('dialog.body'),
              confirm: t('dialog.confirm'),
            },
            sheet: {
              title: t('sheet.title'),
              open: t('sheet.open'),
              heading: t('sheet.heading'),
              body: t('sheet.body'),
            },
            select: {
              title: t('select.title'),
              label: t('select.label'),
              empty: t('select.empty'),
              options: [
                { value: 'retake', label: t('select.options.retake') },
                { value: 'deathmatch', label: t('select.options.deathmatch') },
              ],
            },
            combobox: {
              title: t('combobox.title'),
              label: t('combobox.label'),
              empty: t('combobox.empty'),
              options: (
                [
                  'ak47',
                  'aug',
                  'awp',
                  'bayonet',
                  'deagle',
                  'glock',
                  'm4a1s',
                  'm4a4',
                  'usps',
                ] as const
              ).map((key) => t(`combobox.options.${key}`)),
            },
            confirm: {
              title: t('confirm.title'),
              open: t('confirm.open'),
              heading: t('confirm.heading'),
              body: t('confirm.body'),
              confirm: t('confirm.confirm'),
            },
            counter: {
              title: t('counter.title'),
              add: t('counter.add'),
              label: t('counter.label'),
            },
            status: {
              title: t('status.title'),
              online: t('status.online'),
              warn: t('status.warn'),
              danger: t('status.danger'),
              offline: t('status.offline'),
            },
          }}
        />
      </NextIntlClientProvider>
    </div>
  );
}
