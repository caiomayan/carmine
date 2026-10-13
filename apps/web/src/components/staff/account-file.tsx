'use client';

import {
  accountAnonymizedSchema,
  type StaffAccountDetail,
  type StaffRole,
  type StaffSanction,
  staffAccountDetailSchema,
  staffCan,
  staffRoleSchema,
} from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { siSteam } from 'simple-icons';
import { Avatar } from '@/components/avatar';
import { ArrowLeftIcon } from '@/components/icons/animated/arrow-left';
import { CheckIcon } from '@/components/icons/animated/check';
import { CopyIcon } from '@/components/icons/animated/copy';
import { ExternalLinkIcon } from '@/components/icons/animated/external-link';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { BrandIcon } from '@/components/icons/brand-icon';
import { SectionTitle } from '@/components/section-title';
import { useCopy } from '@/components/servers/use-copy';
import { Button } from '@/components/ui/button';
import { sanctionLength } from '@/lib/moderation';
import { canRevoke, type StaffViewer, sanctionGuard, sanctionState } from '@/lib/staff';
import { cn } from '@/lib/utils';
import { ActionForm } from './action-form';
import { ApplySanctionForm } from './apply-sanction-form';
import { AuditEntries } from './audit-entries';
import { Field, Select, TextInput } from './fields';
import { RoleTag, SanctionTypeTags } from './tags';
import { useStaffRequest } from './use-staff-request';

/**
 * Ficha de uma Conta no painel da Staff: quem é, o que vale agora, aplicar Punição com a
 * sugestão da tabela, o histórico completo (com o motivo interno), VIP, Nome de exibição, papel
 * e as ações da Staff sobre ela. Cada mutação devolve a ficha atualizada.
 */
export function AccountFile({
  initial,
  viewer,
}: {
  initial: StaffAccountDetail;
  viewer: StaffViewer;
}) {
  const [detail, setDetail] = useState(initial);
  const t = useTranslations('staff');
  const { account } = detail;
  const guard = sanctionGuard(viewer, account);

  return (
    <div className="grid gap-8" data-testid="account-file" data-public-id={account.publicId}>
      <div className="animate-fade-up">
        <Button asChild variant="quiet" size="sm" className="-ml-3" data-icon-trigger>
          <Link href="/staff">
            <AnimatedIcon icon={ArrowLeftIcon} size={15} />
            {t('account.back')}
          </Link>
        </Button>
      </div>

      <FileHeader detail={detail} />

      <div className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-10">
          <section aria-labelledby="aplicar" className="animate-fade-up [animation-delay:60ms]">
            <SectionTitle id="aplicar">{t('apply.title')}</SectionTitle>
            {guard === 'ok' ? (
              <ApplySanctionForm detail={detail} viewer={viewer} onApplied={setDetail} />
            ) : (
              <p className="text-[13.5px] text-muted-foreground" data-testid="sanction-guard">
                {guard === 'self' ? t('account.self') : t('account.protected')}
              </p>
            )}
          </section>

          <section aria-labelledby="historico" className="animate-fade-up [animation-delay:90ms]">
            <SectionTitle id="historico">{t('history.title')}</SectionTitle>
            {detail.sanctions.length > 0 ? (
              <ol className="grid" data-testid="staff-sanctions">
                {detail.sanctions.map((sanction) => (
                  <SanctionItem
                    key={sanction.id}
                    sanction={sanction}
                    revocable={canRevoke(viewer, sanction)}
                    onRevoked={setDetail}
                  />
                ))}
              </ol>
            ) : (
              <p className="text-[13.5px] text-muted-foreground">{t('history.empty')}</p>
            )}
          </section>
        </div>

        <aside className="grid min-w-0 gap-10 animate-fade-up [animation-delay:120ms]">
          <VipPanel detail={detail} viewer={viewer} onChange={setDetail} />
          <DisplayNamePanel detail={detail} onChange={setDetail} />
          <RolePanel detail={detail} viewer={viewer} onChange={setDetail} />
          <ErasurePanel detail={detail} viewer={viewer} />
          <section aria-labelledby="auditoria-conta">
            <SectionTitle
              id="auditoria-conta"
              aside={
                staffCan(viewer.role, 'audit.read') ? (
                  <Button asChild variant="quiet" size="sm" className="-my-1">
                    <Link href={`/staff/auditoria?alvo=${detail.account.steamId}` as Route}>
                      {t('audit.viewLog')}
                    </Link>
                  </Button>
                ) : null
              }
            >
              {t('audit.accountTitle')}
            </SectionTitle>
            {detail.audit.length > 0 ? (
              <AuditEntries entries={detail.audit} showTarget={false} />
            ) : (
              <p className="text-[13.5px] text-muted-foreground">{t('audit.empty')}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function FileHeader({ detail }: { detail: StaffAccountDetail }) {
  const t = useTranslations('staff.account');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { account, vip } = detail;
  const { status, copy } = useCopy();

  return (
    <header className="grid animate-fade-up gap-4 [animation-delay:30ms]">
      <div className="flex items-start gap-4">
        <Avatar src={account.avatarUrl} name={account.displayName} size={64} />
        <div className="grid min-w-0 gap-1.5">
          <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[22px] font-semibold tracking-[-0.015em]">
            <span className="break-words" data-testid="file-name">
              {account.displayName}
            </span>
            <span className="text-[15px] font-medium text-muted-foreground tabular-nums">
              #{account.publicId}
            </span>
            {account.staffRole ? <RoleTag role={account.staffRole} /> : null}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {t('steamName', { name: account.steamName })}
            {' · '}
            {account.claimed ? t('claimed') : t('unclaimed')}
            {' · '}
            <span suppressHydrationWarning>
              {account.lastConnectedAt
                ? t('lastSeen', {
                    ago: format.relativeTime(new Date(account.lastConnectedAt), now),
                  })
                : t('neverPlayed')}
            </span>
          </p>
          <div className="-ml-2 flex flex-wrap items-center gap-1 text-[13px]">
            <Button
              variant="quiet"
              size="sm"
              onClick={() => copy(account.steamId)}
              aria-label={t('copySteamId')}
              className="font-medium tabular-nums"
              data-icon-trigger
            >
              {status === 'copied' ? (
                <span className="text-status-success">
                  <AnimatedIcon icon={CheckIcon} size={14} />
                </span>
              ) : (
                <AnimatedIcon icon={CopyIcon} size={14} />
              )}
              {account.steamId}
            </Button>
            <Button asChild variant="quiet" size="sm">
              <Link href={`/${account.publicId}` as Route}>{t('publicProfile')}</Link>
            </Button>
            <Button asChild variant="quiet" size="sm" data-icon-trigger>
              <a
                href={`https://steamcommunity.com/profiles/${account.steamId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <BrandIcon icon={siSteam} size={13} />
                {t('steamProfile')}
                <AnimatedIcon icon={ExternalLinkIcon} size={12} />
              </a>
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="file-status">
        {account.activeSanctions.length > 0 ? (
          <SanctionTypeTags types={account.activeSanctions} />
        ) : (
          <span className="text-muted-foreground">{t('activeNone')}</span>
        )}
        <span aria-hidden="true" className="text-faint">
          ·
        </span>
        <span className={cn(!vip.active && 'text-muted-foreground')} suppressHydrationWarning>
          {vip.active && vip.endsAt
            ? t('vipActive', {
                date: format.dateTime(new Date(vip.endsAt), { dateStyle: 'medium' }),
              })
            : t('vipNone')}
        </span>
      </div>
    </header>
  );
}

function SanctionItem({
  sanction,
  revocable,
  onRevoked,
}: {
  sanction: StaffSanction;
  revocable: boolean;
  onRevoked: (detail: StaffAccountDetail) => void;
}) {
  const t = useTranslations('staff.history');
  const tm = useTranslations('moderation');
  const format = useFormatter();
  const { request } = useStaffRequest();
  const [appeal, setAppeal] = useState(false);
  const appealId = useId();
  const state = sanctionState(sanction);
  const length = sanctionLength(sanction);
  const type = tm(`types.${sanction.type}`);
  const measure =
    length.unit === 'instant'
      ? type
      : length.unit === 'permanent'
        ? tm('measure.permanent', { type })
        : tm('measure.lasting', {
            type,
            duration: tm(`duration.${length.unit}`, { value: length.value }),
          });
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'short', timeStyle: 'short' });
  const name = (actor: StaffSanction['appliedBy']) =>
    actor.displayName ?? (actor.publicId ? `#${actor.publicId}` : actor.steamId);

  return (
    <li
      data-testid="staff-sanction"
      data-type={sanction.type}
      data-state={state}
      className="grid gap-1.5 border-b border-line/60 py-3.5 first:pt-1 last:border-b-0"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-semibold">{measure}</span>
        <span className="text-[13px] text-muted-foreground">
          {tm(`staffCategories.${sanction.category}`)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 rounded-full',
              state === 'active' ? 'bg-status-danger' : 'bg-status-offline',
            )}
          />
          {t(`states.${state}`)}
        </span>
      </div>
      <p className="text-[13.5px] [overflow-wrap:anywhere]" data-testid="sanction-reason">
        {sanction.reason}
      </p>
      {sanction.witness || sanction.evidenceUrl ? (
        <p
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]"
          data-testid="sanction-proof"
        >
          {sanction.witness ? <span>{t('witness', { witness: sanction.witness })}</span> : null}
          {sanction.evidenceUrl ? (
            <a
              href={sanction.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
              data-icon-trigger
            >
              {t('evidence')}
              <AnimatedIcon icon={ExternalLinkIcon} size={12} />
            </a>
          ) : null}
        </p>
      ) : null}
      <p className="text-[12.5px] text-muted-foreground" suppressHydrationWarning>
        {date(sanction.startsAt)}
        {sanction.endsAt ? ` · ${t('until', { date: date(sanction.endsAt) })}` : ''}
        {' · '}
        {t('appliedBy', { name: name(sanction.appliedBy) })}
      </p>
      {sanction.revocation ? (
        <p
          className="text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]"
          suppressHydrationWarning
        >
          {t('revokedBy', {
            name: name(sanction.revocation.by),
            when: date(sanction.revocation.at),
            reason: sanction.revocation.reason,
          })}
        </p>
      ) : null}
      {revocable && (state === 'active' || state === 'instant') ? (
        <ActionForm
          collapsed
          label={t('revoke')}
          submitLabel={t('revokeSubmit')}
          doneLabel={t('done')}
          testId="revoke-form"
          onSubmit={async (reason) => {
            const result = await request(
              `/api/staff/sanctions/${sanction.id}/revoke`,
              'POST',
              { reason, appealAccepted: appeal },
              staffAccountDetailSchema,
            );
            if (result.ok) onRevoked(result.data);
            return result;
          }}
        >
          <label
            htmlFor={appealId}
            className="-ml-2 inline-flex min-h-(--tap) w-fit cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-(--dur-fast) ease-std hover:bg-hover"
          >
            <input
              id={appealId}
              type="checkbox"
              checked={appeal}
              onChange={(event) => setAppeal(event.target.checked)}
              className="mt-0.5 size-4 accent-current"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-semibold">{t('appealAccepted')}</span>
              <span className="text-[12.5px] text-muted-foreground">{t('appealHint')}</span>
            </span>
          </label>
        </ActionForm>
      ) : null}
    </li>
  );
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-1">
      <SectionTitle id={id}>{title}</SectionTitle>
      {children}
    </section>
  );
}

function VipPanel({
  detail,
  viewer,
  onChange,
}: {
  detail: StaffAccountDetail;
  viewer: StaffViewer;
  onChange: (detail: StaffAccountDetail) => void;
}) {
  const t = useTranslations('staff');
  const { request } = useStaffRequest();
  const [days, setDays] = useState('30');
  const id = useId();
  const base = `/api/staff/accounts/${detail.account.publicId}/vip` as const;

  if (!staffCan(viewer.role, 'vip.manage')) {
    return (
      <Panel id="vip" title={t('vip.title')}>
        <p className="text-[13px] text-muted-foreground">{t('vip.readOnly')}</p>
      </Panel>
    );
  }

  const daysValue = Number(days);
  return (
    <Panel id="vip" title={t('vip.title')}>
      <div className="grid gap-1" data-testid="vip-panel">
        <ActionForm
          collapsed
          label={t('vip.grant')}
          submitLabel={t('vip.grantSubmit')}
          doneLabel={t('vip.grantDone')}
          testId="vip-grant"
          validate={() =>
            Number.isInteger(daysValue) && daysValue >= 1 && daysValue <= 3650
              ? null
              : t('errors.invalid_body')
          }
          onSubmit={async (reason) => {
            const result = await request(
              `${base}/grant`,
              'POST',
              { days: daysValue, reason },
              staffAccountDetailSchema,
            );
            if (result.ok) onChange(result.data);
            return result;
          }}
        >
          <Field id={`${id}-days`} label={t('vip.days')} hint={t('vip.grantHint')}>
            <TextInput
              id={`${id}-days`}
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="w-28 tabular-nums"
              aria-describedby={`${id}-days-hint`}
            />
          </Field>
        </ActionForm>
        {detail.vip.active ? (
          <ActionForm
            collapsed
            label={t('vip.revoke')}
            submitLabel={t('vip.revokeSubmit')}
            doneLabel={t('vip.revokeDone')}
            testId="vip-revoke"
            onSubmit={async (reason) => {
              const result = await request(
                `${base}/revoke`,
                'POST',
                { reason },
                staffAccountDetailSchema,
              );
              if (result.ok) onChange(result.data);
              return result;
            }}
          />
        ) : null}
      </div>
    </Panel>
  );
}

function DisplayNamePanel({
  detail,
  onChange,
}: {
  detail: StaffAccountDetail;
  onChange: (detail: StaffAccountDetail) => void;
}) {
  const t = useTranslations('staff.displayName');
  const { request } = useStaffRequest();
  const { account } = detail;
  return (
    <Panel id="nome" title={t('title')}>
      <p className="text-[13px]">{t('current', { name: account.displayName })}</p>
      <ActionForm
        collapsed
        label={t('submit')}
        description={t('hint', { publicId: account.publicId })}
        submitLabel={t('submit')}
        doneLabel={t('done')}
        testId="name-reset"
        onSubmit={async (reason) => {
          const result = await request(
            `/api/staff/accounts/${account.publicId}/display-name/reset`,
            'POST',
            { reason },
            staffAccountDetailSchema,
          );
          if (result.ok) onChange(result.data);
          return result;
        }}
      />
    </Panel>
  );
}

/**
 * Pedido de exclusão de dados (S08), só para o Dono: anonimiza a Conta, sem volta. A Conta da
 * Staff sai da Staff antes.
 */
function ErasurePanel({ detail, viewer }: { detail: StaffAccountDetail; viewer: StaffViewer }) {
  const t = useTranslations('staff.erasure');
  const { request } = useStaffRequest();
  const [erased, setErased] = useState(detail.account.anonymized);
  const { account } = detail;

  if (erased) {
    return (
      <Panel id="exclusao" title={t('title')}>
        <p className="text-[13px]" data-testid="erasure-done">
          {t('anonymized')}
        </p>
      </Panel>
    );
  }
  if (!staffCan(viewer.role, 'accounts.anonymize') || account.staffRole) {
    return (
      <Panel id="exclusao" title={t('title')}>
        <p className="text-[12.5px] text-muted-foreground">
          {account.staffRole ? t('staff') : t('ownerOnly')}
        </p>
      </Panel>
    );
  }
  return (
    <Panel id="exclusao" title={t('title')}>
      <ActionForm
        collapsed
        label={t('submit')}
        description={t('hint')}
        submitLabel={t('submit')}
        doneLabel={t('done')}
        testId="erasure-form"
        onSubmit={async (reason) => {
          const result = await request(
            `/api/staff/accounts/${account.publicId}/anonymize`,
            'POST',
            { reason },
            accountAnonymizedSchema,
          );
          if (result.ok) setErased(true);
          return result;
        }}
      />
    </Panel>
  );
}

function RolePanel({
  detail,
  viewer,
  onChange,
}: {
  detail: StaffAccountDetail;
  viewer: StaffViewer;
  onChange: (detail: StaffAccountDetail) => void;
}) {
  const t = useTranslations('staff');
  const { request } = useStaffRequest();
  const { account } = detail;
  const [role, setRole] = useState<string>(account.staffRole ?? 'none');
  const id = useId();
  const current = t(`roles.${account.staffRole ?? 'none'}`);

  if (!staffCan(viewer.role, 'roles.manage')) {
    return (
      <Panel id="papel" title={t('role.title')}>
        <p className="text-[13px]" data-testid="role-readonly">
          {t('role.current', { role: current })}
        </p>
        <p className="text-[12.5px] text-muted-foreground">{t('role.ownerOnly')}</p>
      </Panel>
    );
  }

  return (
    <Panel id="papel" title={t('role.title')}>
      <p className="text-[13px]">{t('role.current', { role: current })}</p>
      {account.claimed ? (
        <ActionForm
          collapsed
          label={t('role.submit')}
          submitLabel={t('role.submit')}
          doneLabel={t('role.done')}
          testId="role-form"
          onSubmit={async (reason) => {
            const parsed = staffRoleSchema.safeParse(role);
            const result = await request(
              `/api/staff/accounts/${account.publicId}/role`,
              'PUT',
              { role: parsed.success ? parsed.data : null, reason },
              staffAccountDetailSchema,
            );
            if (result.ok) onChange(result.data);
            return result;
          }}
        >
          <Field id={`${id}-role`} label={t('role.label')}>
            <Select
              id={`${id}-role`}
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="none">{t('roles.none')}</option>
              {(['moderator', 'admin', 'owner'] as StaffRole[]).map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
        </ActionForm>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">{t('role.unclaimed')}</p>
      )}
    </Panel>
  );
}
