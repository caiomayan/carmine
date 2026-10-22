'use client';

import type { Preset, PresetList } from '@carmine/contracts';
import { PRESET_NAME_MAX_LENGTH, PRESETS_VIP_LIMIT } from '@carmine/contracts/rules';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import { CheckIcon } from '@/components/icons/animated/check';
import { LockIcon } from '@/components/icons/animated/lock';
import { PlusIcon } from '@/components/icons/animated/plus';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { TextInput } from '@/components/inventory/editor-fields';
import { useInventory } from '@/components/inventory/inventory-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LoadoutApiError, useLoadoutApi } from './use-loadout-api';

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename'; preset: Preset }
  | { kind: 'delete'; preset: Preset }
  | null;

/**
 * Os Presets (S05): o plano grátis tem só o Principal (o Loadout atual); com VIP, até 20,
 * ativáveis de uma vez. Sem VIP, os extras ficam somente leitura, com a explicação na tela.
 * Compactos, numa linha ao lado da troca TR | CT: no celular os Presets rolam na horizontal.
 */
export function PresetBar({ list, vip }: { list: PresetList; vip: boolean }) {
  const t = useTranslations('loadout.presets');
  const te = useTranslations('loadout.errors');
  const api = useLoadoutApi();
  const router = useRouter();
  const { notify } = useInventory();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { presets, limit } = list;
  const active = presets.find((preset) => preset.active);
  const main = presets.find((preset) => preset.main);
  const anyReadOnly = presets.some((preset) => preset.readOnly);
  const full = presets.length >= limit;

  const message = (caught: unknown) => {
    const code = caught instanceof LoadoutApiError ? caught.code : 'network';
    return code === 'session' ? null : code === 'unexpected' ? te('network') : te(code);
  };

  async function activate(preset: Preset) {
    if (preset.active || preset.readOnly) return;
    setPending(preset.id);
    setError(null);
    try {
      await api.activatePreset(preset.id);
      notify(t('activated', { name: preset.name }));
      router.refresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-label={t('title')}
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 md:justify-end"
      data-testid="presets"
    >
      <div className="flex min-w-0 max-w-full items-center gap-1.5 max-md:w-full">
        <ul
          className="flex min-w-0 items-center gap-1.5 max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden md:flex-wrap md:justify-end"
          aria-label={t('label')}
        >
          {presets.map((preset) => (
            <li
              key={preset.id}
              className={cn(
                'group/preset flex flex-none items-center rounded-md transition-colors duration-(--dur-fast) ease-std',
                preset.active ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2',
              )}
              data-testid="preset"
              data-active={preset.active || undefined}
              data-read-only={preset.readOnly || undefined}
            >
              <button
                type="button"
                onClick={() => activate(preset)}
                aria-pressed={preset.active}
                aria-disabled={preset.readOnly || undefined}
                aria-label={preset.active ? undefined : t('activate', { name: preset.name })}
                disabled={pending !== null}
                className={cn(
                  'inline-flex min-h-9 items-center gap-2 rounded-md py-1.5 pr-2 pl-3 text-left text-sm font-[550] max-md:min-h-(--tap)',
                  preset.readOnly && 'cursor-not-allowed text-muted-foreground',
                  pending === preset.id && 'animate-pulse motion-reduce:animate-none',
                )}
                data-icon-trigger
              >
                {preset.active ? (
                  <AnimatedIcon icon={CheckIcon} size={14} />
                ) : preset.readOnly ? (
                  <AnimatedIcon icon={LockIcon} size={13} className="text-status-vip" />
                ) : null}
                <span className="max-w-[22ch] truncate">{preset.name}</span>
                <span className="text-[12px] font-normal text-muted-foreground tabular-nums">
                  {t('equippedCount', { count: preset.equippedCount })}
                </span>
                {preset.active ? <span className="sr-only">{t('active')}</span> : null}
                {preset.readOnly ? <span className="sr-only">{t('readOnly')}</span> : null}
              </button>
              {preset.main && !vip ? null : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={t('actions', { name: preset.name })}
                    disabled={preset.readOnly}
                    className="mr-1 grid size-(--tap) place-items-center rounded-sm text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground disabled:opacity-40 aria-expanded:bg-hover"
                    data-testid="preset-menu"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="size-4"
                      fill="currentColor"
                    >
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-36">
                    <DropdownMenuItem
                      onSelect={() => setDialog({ kind: 'rename', preset })}
                      data-testid="preset-rename"
                    >
                      {t('rename')}
                    </DropdownMenuItem>
                    {preset.main ? null : (
                      <DropdownMenuItem
                        onSelect={() => setDialog({ kind: 'delete', preset })}
                        data-testid="preset-delete"
                      >
                        {t('delete')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>

        {vip ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDialog({ kind: 'create' })}
            disabled={full}
            data-testid="preset-new"
          >
            <AnimatedIcon icon={PlusIcon} size={15} />
            {t('new')}
          </Button>
        ) : null}
        <span
          className="flex-none px-1 text-[12px] text-muted-foreground tabular-nums"
          data-testid="preset-count"
        >
          {t('count', { count: presets.length, limit })}
        </span>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-[13px]">
          <span
            aria-hidden="true"
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
          />
          {error}
        </p>
      ) : null}

      {active?.readOnly && main ? (
        <Explanation testId="preset-active-read-only">
          <span className="flex-1">{t('activeReadOnly', { name: active.name })}</span>
          <Button
            variant="ghost"
            size="sm"
            className="-my-1"
            onClick={() => activate(main)}
            disabled={pending !== null}
            data-testid="activate-main"
          >
            {t('activateMain')}
          </Button>
        </Explanation>
      ) : anyReadOnly ? (
        <Explanation testId="preset-read-only">{t('readOnlyBody')}</Explanation>
      ) : !vip ? (
        <p
          className="max-w-[46ch] text-[12px] leading-snug text-muted-foreground"
          data-testid="preset-free"
        >
          {t('freeLimit', { limit: PRESETS_VIP_LIMIT })}
        </p>
      ) : full ? (
        <p className="text-[12px] text-muted-foreground" role="status">
          {t('limitReached', { limit })}
        </p>
      ) : null}

      {dialog?.kind === 'create' || dialog?.kind === 'rename' ? (
        <NameDialog
          preset={dialog.kind === 'rename' ? dialog.preset : null}
          onClose={() => setDialog(null)}
          errorOf={message}
        />
      ) : dialog?.kind === 'delete' ? (
        <DeleteDialog preset={dialog.preset} onClose={() => setDialog(null)} errorOf={message} />
      ) : null}
    </section>
  );
}

function Explanation({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <div
      role="note"
      data-testid={testId}
      data-icon-trigger
      className="flex max-w-[56ch] animate-fade-up flex-wrap items-start gap-x-2.5 gap-y-1 rounded-lg bg-surface px-3 py-2 text-[12.5px] leading-[1.5]"
    >
      <AnimatedIcon icon={LockIcon} size={14} className="mt-0.5 text-status-vip" />
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

/** Criar (nome e ponto de partida) ou renomear um Preset. */
function NameDialog({
  preset,
  onClose,
  errorOf,
}: {
  preset: Preset | null;
  onClose: () => void;
  errorOf: (caught: unknown) => string | null;
}) {
  const t = useTranslations('loadout.presets');
  const te = useTranslations('loadout.errors');
  const tc = useTranslations('common');
  const api = useLoadoutApi();
  const router = useRouter();
  const { notify } = useInventory();
  const [name, setName] = useState(preset?.name ?? '');
  const [from, setFrom] = useState<'current' | 'empty'>('current');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const fromId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > PRESET_NAME_MAX_LENGTH) {
      setError(te('name', { max: PRESET_NAME_MAX_LENGTH }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (preset) {
        await api.renamePreset(preset.id, trimmed);
        notify(t('renameDialog.renamed', { name: trimmed }));
      } else {
        await api.createPreset({ name: trimmed, from });
        notify(t('create.created', { name: trimmed }));
      }
      onClose();
      router.refresh();
    } catch (caught) {
      setError(errorOf(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        closeLabel={tc('close')}
        className="gap-5 sm:max-w-md"
        data-testid="preset-dialog"
      >
        <form onSubmit={submit} noValidate className="grid gap-5">
          <div className="grid gap-2 pr-8">
            <DialogTitle>
              {preset ? t('renameDialog.title', { name: preset.name }) : t('create.title')}
            </DialogTitle>
            {preset ? null : <DialogDescription>{t('create.body')}</DialogDescription>}
          </div>
          <div className="grid gap-2">
            <label htmlFor={nameId} className="label-caps text-[10.5px]">
              {t('create.name')}
            </label>
            <TextInput
              id={nameId}
              value={name}
              maxLength={PRESET_NAME_MAX_LENGTH}
              placeholder={t('create.namePlaceholder')}
              autoComplete="off"
              autoFocus
              aria-invalid={!!error || undefined}
              aria-describedby={`${nameId}-hint`}
              onChange={(event) => setName(event.target.value)}
              data-testid="preset-name"
            />
            <p id={`${nameId}-hint`} className="text-[12.5px] text-muted-foreground">
              {t('create.nameHint', { max: PRESET_NAME_MAX_LENGTH })}
            </p>
          </div>
          {preset ? null : (
            <fieldset className="grid gap-2">
              <legend id={fromId} className="pb-2 label-caps text-[10.5px]">
                {t('create.from')}
              </legend>
              {(['current', 'empty'] as const).map((option) => (
                <label
                  key={option}
                  className="flex min-h-(--tap) cursor-pointer items-center gap-3 rounded-md bg-surface px-3 text-[13.5px] transition-colors duration-(--dur-fast) ease-std hover:bg-surface-2 has-checked:bg-surface-2"
                >
                  <input
                    type="radio"
                    name="from"
                    value={option}
                    checked={from === option}
                    onChange={() => setFrom(option)}
                    className="size-4 accent-(--text)"
                  />
                  {option === 'current' ? t('create.fromCurrent') : t('create.fromEmpty')}
                </label>
              ))}
            </fieldset>
          )}
          {error ? (
            <p role="alert" className="flex items-start gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
              />
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving} data-testid="preset-submit">
              {saving ? t('saving') : preset ? t('renameDialog.submit') : t('create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  preset,
  onClose,
  errorOf,
}: {
  preset: Preset;
  onClose: () => void;
  errorOf: (caught: unknown) => string | null;
}) {
  const t = useTranslations('loadout.presets');
  const tc = useTranslations('common');
  const api = useLoadoutApi();
  const router = useRouter();
  const { notify } = useInventory();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await api.deletePreset(preset.id);
      notify(t('deleteDialog.deleted', { name: preset.name }));
      onClose();
      router.refresh();
    } catch (caught) {
      setError(errorOf(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        closeLabel={tc('close')}
        className="gap-5 sm:max-w-md"
        data-testid="preset-dialog"
      >
        <div className="grid gap-2 pr-8">
          <DialogTitle>{t('deleteDialog.title', { name: preset.name })}</DialogTitle>
          <DialogDescription>
            {preset.active ? t('deleteDialog.bodyActive') : t('deleteDialog.body')}
          </DialogDescription>
        </div>
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
            />
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={confirm} disabled={saving} data-testid="preset-submit">
            {saving ? t('saving') : t('deleteDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
