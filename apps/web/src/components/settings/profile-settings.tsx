'use client';

import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from '@carmine/contracts/rules';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useId, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import { Switch } from '@/components/animate-ui/components/radix/switch';
import { useSession } from '@/components/session/session-provider';
import { FieldError } from '@/components/staff/fields';
import { Button } from '@/components/ui/button';
import { LabelInput } from '@/components/ui/label-input';
import { cn } from '@/lib/utils';
import { AvatarSetting } from './avatar-setting';

/**
 * Ajustes do próprio Perfil (S11), em Configurações > Perfil: o Nome de exibição (uma troca a cada
 * 7 dias) e o Perfil privado. Os schemas Zod só são carregados quando a resposta da API precisa
 * ser lida.
 */
export function ProfileSettings() {
  const { account } = useSession();
  if (!account) return null;

  return (
    <div className="grid gap-1" data-testid="profile-settings">
      <AvatarSetting />
      <NameRow />
      <PrivacyRow />
    </div>
  );
}

type NameState =
  | { kind: 'idle' }
  | { kind: 'saved'; name: string }
  | { kind: 'reverted'; name: string }
  | { kind: 'error'; message: string };

function NameRow() {
  const t = useTranslations('settings.name');
  const format = useFormatter();
  const router = useRouter();
  const { account, displayNameChange, mutate, updateAccount } = useSession();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [reverting, setReverting] = useState(false);
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
      const { displayNameChangedSchema, displayNameErrorSchema } = await import(
        '@carmine/contracts/profile'
      );
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

  async function revert() {
    setBusy(true);
    try {
      const response = await mutate('/api/me/display-name', { method: 'DELETE' });
      if (response.status === 401) return;
      const body: unknown = await response.json().catch(() => null);
      const { displayNameRevertedSchema } = await import('@carmine/contracts/profile');
      if (!response.ok) throw new Error(String(response.status));
      const reverted = displayNameRevertedSchema.parse(body);
      updateAccount({
        displayName: reverted.displayName,
        displayNameChange: { custom: false, nextChangeAt: reverted.nextChangeAt },
      });
      setReverting(false);
      setState({ kind: 'reverted', name: reverted.displayName });
      router.refresh();
      requestAnimationFrame(() => openButton.current?.focus());
    } catch {
      setState({ kind: 'error', message: t('errors.generic') });
      setReverting(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg px-4 py-3 max-md:px-3" data-testid="name-setting">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="text-body font-semibold">{t('title')}</h3>
          <p className="text-body-sm text-muted-foreground">
            {displayNameChange.custom ? t('customHint') : t('steamHint')}
          </p>
        </div>
        {editing ? null : (
          <div className="flex flex-wrap items-center gap-1">
            {displayNameChange.custom ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReverting(true)}
                data-testid="name-revert"
              >
                {t('revert.open')}
              </Button>
            ) : null}
            <Button
              ref={openButton}
              variant="ghost"
              size="sm"
              onClick={open}
              data-testid="name-edit"
            >
              {t('edit')}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={reverting} onOpenChange={setReverting}>
        <DialogContent
          closeLabel={t('revert.close')}
          className="gap-5 sm:max-w-md"
          data-testid="name-revert-dialog"
        >
          <div className="grid gap-2 pr-8">
            <DialogTitle>{t('revert.title')}</DialogTitle>
            <DialogDescription className="text-body-sm leading-[1.55]">
              {t('revert.body')}{' '}
              {nextChangeAt
                ? t('revert.cooldownActive', { when: when(nextChangeAt) })
                : t('revert.cooldownFree')}
            </DialogDescription>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReverting(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={revert} disabled={busy} data-testid="name-revert-confirm">
              {t('revert.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing ? (
        <form onSubmit={submit} className="grid gap-3" data-testid="name-form" noValidate>
          <LabelInput
            ref={input}
            id={inputId}
            label={t('label')}
            hint={t('rules', { min: DISPLAY_NAME_MIN_LENGTH, max: DISPLAY_NAME_MAX_LENGTH })}
            error={state.kind === 'error' ? state.message : undefined}
            type="text"
            name="displayName"
            autoComplete="nickname"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={DISPLAY_NAME_MAX_LENGTH * 4}
            data-testid="name-input"
          />
          <p className="text-body-sm text-muted-foreground" data-testid="name-cooldown">
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

      <div
        aria-live="polite"
        className={cn(state.kind === 'saved' || state.kind === 'reverted' ? '' : 'sr-only')}
      >
        {state.kind === 'saved' ? (
          <p className="text-body-sm" data-testid="name-saved">
            {t('saved', { name: state.name })}
          </p>
        ) : state.kind === 'reverted' ? (
          <p className="text-body-sm" data-testid="name-reverted">
            {t('revert.done', { name: state.name })}
          </p>
        ) : null}
      </div>
      {!editing && state.kind === 'error' ? <FieldError>{state.message}</FieldError> : null}
    </div>
  );
}

function PrivacyRow() {
  const t = useTranslations('settings.privacy');
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
    <div className="grid gap-2 rounded-lg px-4 py-3 max-md:px-3" data-testid="privacy-setting">
      {/* A linha inteira é o rótulo do interruptor: o alvo de toque é a linha, não os 36 px dele. */}
      <label
        htmlFor={switchId}
        className="flex min-h-(--tap) cursor-pointer items-center justify-between gap-4 py-1"
      >
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-body font-semibold">{t('title')}</span>
          <span className="text-body-sm text-muted-foreground">{t('description')}</span>
        </span>
        <Switch
          id={switchId}
          checked={account.isPrivate}
          disabled={busy}
          onCheckedChange={toggle}
          data-testid="privacy-switch"
        />
      </label>
      <p
        aria-live="polite"
        className="text-body-sm text-muted-foreground"
        data-testid="privacy-status"
      >
        {announce === 'on' ? t('announceOn') : announce === 'off' ? t('announceOff') : null}
      </p>
      {failed ? <FieldError>{t('failed')}</FieldError> : null}
    </div>
  );
}
