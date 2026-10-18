'use client';

import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from '@carmine/contracts/rules';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Switch } from '@/components/animate-ui/components/radix/switch';
import { SectionTitle } from '@/components/section-title';
import { useSession } from '@/components/session/session-provider';
import { controlClass, Field, FieldError } from '@/components/staff/fields';
import { Button } from '@/components/ui/button';
import { loadContracts } from '@/lib/contracts-schemas';
import { cn } from '@/lib/utils';

/**
 * Ajustes do próprio Perfil (S11), só para o dono: o Nome de exibição (uma troca a cada 7 dias) e
 * o Perfil privado. Os schemas Zod só são carregados quando a resposta da API precisa ser lida.
 */
export function ProfileSettings() {
  const t = useTranslations('profile.settings');
  const { account } = useSession();
  if (!account) return null;

  return (
    <section
      aria-labelledby="ajustes"
      data-testid="profile-settings"
      className="animate-fade-up pt-8 [animation-delay:60ms]"
    >
      <SectionTitle id="ajustes">{t('title')}</SectionTitle>
      <div className="grid gap-1 rounded-xl bg-surface p-2 max-md:p-1">
        <NameRow />
        <PrivacyRow />
      </div>
    </section>
  );
}

type NameState =
  | { kind: 'idle' }
  | { kind: 'saved'; name: string }
  | { kind: 'error'; message: string };

function NameRow() {
  const t = useTranslations('profile.settings.name');
  const format = useFormatter();
  const router = useRouter();
  const { account, displayNameChange, mutate, updateAccount } = useSession();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<NameState>({ kind: 'idle' });
  const input = useRef<HTMLInputElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);

  if (!account || !displayNameChange) return null;

  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });
  const nextChangeAt =
    displayNameChange.nextChangeAt && new Date(displayNameChange.nextChangeAt) > new Date()
      ? displayNameChange.nextChangeAt
      : null;

  function open() {
    setValue(account?.displayName ?? '');
    setState({ kind: 'idle' });
    setEditing(true);
    // O campo só existe depois da renderização.
    requestAnimationFrame(() => input.current?.select());
  }

  function close() {
    setEditing(false);
    setState({ kind: 'idle' });
    requestAnimationFrame(() => openButton.current?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await mutate('/api/me/display-name', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: value }),
      });
      if (response.status === 401) return;
      const body: unknown = await response.json().catch(() => null);
      const { displayNameChangedSchema, displayNameErrorSchema } = await loadContracts();
      if (response.ok) {
        const changed = displayNameChangedSchema.parse(body);
        updateAccount({
          displayName: changed.displayName,
          displayNameChange: { custom: true, nextChangeAt: changed.nextChangeAt },
        });
        setEditing(false);
        setState({ kind: 'saved', name: changed.displayName });
        router.refresh();
        requestAnimationFrame(() => openButton.current?.focus());
        return;
      }
      const error = displayNameErrorSchema.safeParse(body);
      if (error.success && error.data.code === 'too_soon' && error.data.nextChangeAt) {
        updateAccount({
          displayNameChange: { custom: true, nextChangeAt: error.data.nextChangeAt },
        });
        setState({
          kind: 'error',
          message: t('errors.too_soon', { when: when(error.data.nextChangeAt) }),
        });
      } else if (error.success && error.data.code !== 'invalid_body') {
        setState({ kind: 'error', message: t(`errors.${error.data.code}`) });
      } else {
        setState({ kind: 'error', message: t('errors.generic') });
      }
    } catch {
      setState({ kind: 'error', message: t('errors.generic') });
    } finally {
      setBusy(false);
    }
  }

  const errorId = `${inputId}-error`;

  return (
    <div className="grid gap-3 rounded-lg px-4 py-3 max-md:px-3" data-testid="name-setting">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="text-[14px] font-semibold">{t('title')}</h3>
          <p className="text-[13px] text-muted-foreground">
            {displayNameChange.custom ? t('customHint') : t('steamHint')}
          </p>
        </div>
        {editing ? null : (
          <Button ref={openButton} variant="ghost" size="sm" onClick={open} data-testid="name-edit">
            {t('edit')}
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={submit} className="grid gap-3" data-testid="name-form" noValidate>
          <Field
            id={inputId}
            label={t('label')}
            hint={t('rules', { min: DISPLAY_NAME_MIN_LENGTH, max: DISPLAY_NAME_MAX_LENGTH })}
            error={state.kind === 'error' ? state.message : undefined}
          >
            <input
              ref={input}
              id={inputId}
              type="text"
              name="displayName"
              autoComplete="nickname"
              autoCapitalize="off"
              spellCheck={false}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={DISPLAY_NAME_MAX_LENGTH * 4}
              aria-invalid={state.kind === 'error' || undefined}
              aria-describedby={state.kind === 'error' ? errorId : `${inputId}-hint`}
              className={controlClass}
              data-testid="name-input"
            />
          </Field>
          <p className="text-[12.5px] text-muted-foreground" data-testid="name-cooldown">
            {nextChangeAt ? t('cooldownActive', { when: when(nextChangeAt) }) : t('cooldownRule')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={busy} data-testid="name-save">
              {t('save')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : null}

      <div aria-live="polite" className={cn(state.kind === 'saved' ? '' : 'sr-only')}>
        {state.kind === 'saved' ? (
          <p className="text-[13px]" data-testid="name-saved">
            {t('saved', { name: state.name })}
          </p>
        ) : null}
      </div>
      {!editing && state.kind === 'error' ? <FieldError>{state.message}</FieldError> : null}
    </div>
  );
}

function PrivacyRow() {
  const t = useTranslations('profile.settings.privacy');
  const router = useRouter();
  const { account, mutate, updateAccount } = useSession();
  const switchId = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [announce, setAnnounce] = useState<'on' | 'off' | null>(null);

  if (!account) return null;

  async function toggle(isPrivate: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      const response = await mutate('/api/me/privacy', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isPrivate }),
      });
      if (response.status === 401) return;
      if (!response.ok) throw new Error(String(response.status));
      updateAccount({ isPrivate });
      setAnnounce(isPrivate ? 'on' : 'off');
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg px-4 py-3 max-md:px-3" data-testid="privacy-setting">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={switchId} className="grid min-w-0 flex-1 cursor-pointer gap-0.5 py-1">
          <span className="text-[14px] font-semibold">{t('title')}</span>
          <span className="text-[13px] text-muted-foreground">{t('description')}</span>
        </label>
        <Switch
          id={switchId}
          checked={account.isPrivate}
          disabled={busy}
          onCheckedChange={toggle}
          data-testid="privacy-switch"
        />
      </div>
      <div aria-live="polite">
        {announce === 'on' ? (
          <div
            className="grid gap-1 rounded-md bg-surface-2 px-3 py-2.5"
            data-testid="privacy-on-note"
          >
            <p className="text-[13px] font-semibold">{t('onTitle')}</p>
            <p className="text-[13px] text-muted-foreground">{t('onBody')}</p>
          </div>
        ) : announce === 'off' ? (
          <p className="text-[13px] text-muted-foreground">{t('offNote')}</p>
        ) : null}
      </div>
      {failed ? <FieldError>{t('failed')}</FieldError> : null}
    </div>
  );
}
