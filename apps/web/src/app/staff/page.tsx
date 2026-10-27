import type { StaffAccountSummary, StaffMember } from '@carmine/contracts';
import {
  STAFF_SEARCH_LIMIT,
  STAFF_SEARCH_MIN_LENGTH,
  staffAccountSearchSchema,
  staffMemberListSchema,
} from '@carmine/contracts/staff';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { SearchIcon } from '@/components/icons/animated/search';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { SectionTitle } from '@/components/section-title';
import { FieldError } from '@/components/staff/fields';
import { RoleTag, SanctionTypeTags } from '@/components/staff/tags';
import { Button } from '@/components/ui/button';
import { readStaff } from '@/lib/api-server';

type SearchParams = Promise<{ q?: string | string[] }>;

/** Busca de Conta: o formulário é um GET simples (a busca fica no endereço e no histórico). */
export default async function StaffAccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  const t = await getTranslations('staff');
  const tooShort = query.length > 0 && query.length < STAFF_SEARCH_MIN_LENGTH;
  const search =
    query.length >= STAFF_SEARCH_MIN_LENGTH
      ? await readStaff(`/staff/accounts?q=${encodeURIComponent(query)}`, staffAccountSearchSchema)
      : null;
  if (search?.status === 'forbidden' || search?.status === 'anonymous') notFound();
  const members = query ? null : await readStaff('/staff/members', staffMemberListSchema);

  return (
    <div className="grid gap-10">
      <search aria-label={t('search.label')} className="animate-fade-up [animation-delay:60ms]">
        <form action="/staff" method="get" className="flex gap-2 max-md:flex-col">
          <div className="relative flex-1" data-icon-trigger>
            <label htmlFor="staff-q" className="sr-only">
              {t('search.label')}
            </label>
            <AnimatedIcon
              icon={SearchIcon}
              size={16}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="staff-q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder={t('search.placeholder')}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              aria-describedby="staff-q-hint"
              aria-invalid={tooShort || undefined}
              data-testid="staff-search"
              className="min-h-11 w-full rounded-lg bg-surface pr-4 pl-10 text-body transition-colors duration-(--dur-fast) ease-std placeholder:text-muted-foreground hover:bg-surface-2 focus-visible:bg-surface-2"
            />
          </div>
          <Button type="submit" className="min-h-11">
            {t('search.submit')}
          </Button>
        </form>
        <div id="staff-q-hint" className="pt-2">
          {tooShort ? (
            <FieldError>{t('search.tooShort', { min: STAFF_SEARCH_MIN_LENGTH })}</FieldError>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              {t('search.hint', { min: STAFF_SEARCH_MIN_LENGTH, limit: STAFF_SEARCH_LIMIT })}
            </p>
          )}
        </div>
      </search>

      {search ? (
        <section aria-labelledby="resultados" className="animate-fade-up">
          {search.status === 'ok' ? (
            <>
              <SectionTitle id="resultados">
                {t('search.results', { count: search.data.accounts.length })}
              </SectionTitle>
              {search.data.accounts.length > 0 ? (
                <AccountList accounts={search.data.accounts} />
              ) : (
                <div className="rounded-xl bg-surface">
                  <EmptyState
                    icon={SearchIcon}
                    title={t('search.emptyTitle')}
                    body={t('search.emptyBody')}
                  />
                </div>
              )}
            </>
          ) : (
            <p role="alert" id="resultados" className="text-sm">
              {t('unavailable')}
            </p>
          )}
        </section>
      ) : null}

      {members?.status === 'ok' && members.data.members.length > 0 ? (
        <section aria-labelledby="membros" className="animate-fade-up [animation-delay:100ms]">
          <SectionTitle id="membros">{t('members.title')}</SectionTitle>
          <MemberList members={members.data.members} />
        </section>
      ) : null}
    </div>
  );
}

const rowClass =
  'group/row -mx-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 rounded-lg px-3 py-2.5 transition-colors duration-(--dur-fast) ease-std hover:bg-surface focus-visible:bg-surface';

async function AccountList({ accounts }: { accounts: StaffAccountSummary[] }) {
  const t = await getTranslations('staff');
  const format = await getFormatter();
  const now = new Date();
  return (
    <ul className="grid gap-0.5" data-testid="staff-results">
      {accounts.map((account, index) => (
        <li
          key={account.publicId}
          className="enter-stagger"
          style={{ '--i': index } as CSSProperties}
        >
          <Link
            href={`/staff/contas/${account.publicId}` as Route}
            aria-label={t('search.open', { name: account.displayName })}
            data-testid="staff-result"
            className={rowClass}
          >
            <Avatar src={account.avatarUrl} name={account.displayName} size={36} />
            <span className="grid min-w-0 gap-0.5">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate font-semibold">{account.displayName}</span>
                <span className="text-body-sm text-muted-foreground tabular-nums">
                  #{account.publicId}
                </span>
                {account.staffRole ? <RoleTag role={account.staffRole} /> : null}
                <SanctionTypeTags types={account.activeSanctions} />
              </span>
              <span className="truncate text-body-sm text-muted-foreground tabular-nums">
                {account.steamId}
                {account.steamName !== account.displayName ? ` · ${account.steamName}` : ''}
                {account.claimed ? '' : ` · ${t('search.unclaimed')}`}
              </span>
            </span>
            <span className="text-right text-body-sm text-muted-foreground max-md:hidden">
              {account.lastConnectedAt
                ? t('search.lastSeen', {
                    ago: format.relativeTime(new Date(account.lastConnectedAt), now),
                  })
                : t('search.neverPlayed')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function MemberList({ members }: { members: StaffMember[] }) {
  const t = await getTranslations('staff');
  const format = await getFormatter();
  return (
    <ul className="grid gap-0.5">
      {members.map((member) => (
        <li key={member.publicId}>
          <Link href={`/staff/contas/${member.publicId}` as Route} className={rowClass}>
            <Avatar src={member.avatarUrl} name={member.displayName} size={32} />
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold">{member.displayName}</span>
              <span className="text-body-sm text-muted-foreground tabular-nums">
                #{member.publicId}
              </span>
              <RoleTag role={member.role} />
            </span>
            <span className="text-body-sm text-muted-foreground max-md:hidden">
              {t('members.since', {
                date: format.dateTime(new Date(member.since), { dateStyle: 'medium' }),
              })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
