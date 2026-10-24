'use client';

import type { Preset } from '@carmine/contracts';
import { PRESET_NAME_MAX_LENGTH } from '@carmine/contracts/rules';
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
import { LockIcon } from '@/components/icons/animated/lock';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { useInventory } from '@/components/inventory/inventory-provider';
import { Button } from '@/components/ui/button';
import { LabelInput } from '@/components/ui/label-input';
import { useLoadoutApi } from './use-loadout-api';

/** Os diálogos só precisam destes campos do Preset (a carta da mão os tem). */
export type PresetRef = Pick<Preset, 'id' | 'name' | 'active'>;

/** Os diálogos de Preset (criar, renomear, apagar) e o aviso de somente leitura da mão de Presets. */

export function Explanation({ children, testId }: { children: React.ReactNode; testId: string }) {
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
export function NameDialog({
  preset,
  onClose,
  errorOf,
}: {
  preset: PresetRef | null;
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
          <LabelInput
            id={nameId}
            label={t('create.name')}
            hint={t('create.nameHint', { max: PRESET_NAME_MAX_LENGTH })}
            value={name}
            maxLength={PRESET_NAME_MAX_LENGTH}
            placeholder={t('create.namePlaceholder')}
            autoComplete="off"
            autoFocus
            aria-invalid={!!error || undefined}
            onChange={(event) => setName(event.target.value)}
            data-testid="preset-name"
          />
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

export function DeleteDialog({
  preset,
  onClose,
  errorOf,
}: {
  preset: PresetRef;
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
