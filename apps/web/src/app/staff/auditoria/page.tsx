import {
  staffAuditActionSchema,
  staffAuditPageSchema,
  staffCan,
  steamId64Schema,
} from '@carmine/contracts';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AuditLog } from '@/components/staff/audit-log';
import { Field } from '@/components/staff/fields';
import { Button } from '@/components/ui/button';
import { LabelInput } from '@/components/ui/label-input';
import { SimpleSelect } from '@/components/ui/select';
import { getServerSession, readStaff } from '@/lib/api-server';

type SearchParams = Promise<Record<'acao' | 'autor' | 'alvo', string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/** Log de auditoria inteiro (Admin e Dono), filtrável por ação, autor e alvo (SteamID64). */
export default async function StaffAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const server = await getServerSession();
  const role = server.status === 'authenticated' ? server.session.staffRole : null;
  if (!staffCan(role, 'audit.read')) notFound();
  const params = await searchParams;
  const parsedAction = staffAuditActionSchema.safeParse(first(params.acao));
  const actorRaw = first(params.autor);
  const targetRaw = first(params.alvo);
  const actorOk = steamId64Schema.safeParse(actorRaw).success;
  const targetOk = steamId64Schema.safeParse(targetRaw).success;
  const filters = {
    action: parsedAction.success ? parsedAction.data : null,
    actor: actorOk ? actorRaw : null,
    target: targetOk ? targetRaw : null,
  };
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== null),
  ).toString();
  const result = await readStaff(`/staff/audit${query ? `?${query}` : ''}`, staffAuditPageSchema);
  if (result.status === 'forbidden' || result.status === 'anonymous') notFound();
  const t = await getTranslations('staff.audit');

  return (
    <section aria-labelledby="log" className="grid animate-fade-up gap-5 [animation-delay:60ms]">
      <div className="grid gap-1">
        <h2 id="log" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-body-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <form
        action="/staff/auditoria"
        method="get"
        aria-label={t('filters')}
        className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <Field id="acao" label={t('filter')}>
          <SimpleSelect
            id="acao"
            name="acao"
            defaultValue={filters.action ?? ''}
            emptyLabel={t('allActions')}
            options={staffAuditActionSchema.options.map((value) => ({
              value,
              label: t(`actions.${value}`),
            }))}
          />
        </Field>
        <LabelInput
          id="autor"
          label={t('actor')}
          error={actorRaw && !actorOk ? t('steamIdInvalid') : undefined}
          name="autor"
          inputMode="numeric"
          defaultValue={actorRaw}
          placeholder={t('steamIdPlaceholder')}
          className="tabular-nums"
        />
        <LabelInput
          id="alvo"
          label={t('target')}
          error={targetRaw && !targetOk ? t('steamIdInvalid') : undefined}
          name="alvo"
          inputMode="numeric"
          defaultValue={targetRaw}
          placeholder={t('steamIdPlaceholder')}
          className="tabular-nums"
        />
        <Button type="submit" variant="ghost">
          {t('apply')}
        </Button>
      </form>
      {result.status === 'ok' ? (
        <AuditLog key={query || 'all'} initial={result.data} filters={filters} />
      ) : (
        <p role="alert" className="text-sm">
          {(await getTranslations('staff'))('unavailable')}
        </p>
      )}
    </section>
  );
}
