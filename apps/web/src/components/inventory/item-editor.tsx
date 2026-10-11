'use client';

import { type Cs2Item, inventoryErrorSchema, inventoryItemSchema } from '@carmine/contracts';
import type { Route } from 'next';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { siSteam } from 'simple-icons';
import { Switch } from '@/components/animate-ui/components/radix/switch';
import { HistoryIcon } from '@/components/icons/animated/history';
import { LockIcon } from '@/components/icons/animated/lock';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { BrandIcon } from '@/components/icons/brand-icon';
import { useSession } from '@/components/session/session-provider';
import { useDraft } from '@/components/session/use-draft';
import { Button } from '@/components/ui/button';
import { signInHref } from '@/lib/auth-links';
import type { ItemSpec } from '@/lib/catalog/catalog';
import { formatDecimal } from '@/lib/decimal';
import {
  type AttachmentLabel,
  emptyForm,
  type FormIssue,
  type FormSpec,
  formFromItem,
  formToItem,
  type ItemForm,
  issueFromApiError,
  validateForm,
} from '@/lib/inventory/item-form';
import { cn } from '@/lib/utils';
import { CharmEditor, StickersEditor } from './attachments-editor';
import { DecimalInput, describedBy, FieldShell, FloatField, TextInput } from './editor-fields';
import { useInventory } from './inventory-provider';
import { ItemViewer } from './item-viewer';

// Remover só baixa o diálogo quando a pessoa pede.
const RemoveItemDialog = dynamic(
  () => import('./remove-item-dialog').then((m) => m.RemoveItemDialog),
  { ssr: false },
);

type EditorProps =
  | { mode: 'new'; spec: ItemSpec; labels?: undefined; uid?: undefined; saved?: undefined }
  | { mode: 'edit'; spec: ItemSpec; labels: AttachmentLabel[]; uid: string; saved: Cs2Item };

/**
 * O editor de Item (S04): prévia 3D (ou 2D) à esquerda e os atributos por formulário à direita.
 * Cada mudança vai para o rascunho local (`useDraft`), que sobrevive à expiração da sessão.
 * Salvar manda o Item inteiro (POST para adicionar, PUT para editar); a API decide, e os códigos
 * de erro do contrato voltam como mensagens nos campos.
 */
export function ItemEditor(props: EditorProps) {
  const { mode, spec } = props;
  const t = useTranslations('itemEditor');
  const ti = useTranslations('inventory');
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const inventory = useInventory();
  const vip = session.vip?.active ?? false;
  const signedIn = session.status === 'authenticated';
  const { entry } = spec;

  const formSpec: FormSpec = useMemo(
    () => ({
      id: entry.id,
      wear: spec.wear,
      seed: spec.seed,
      statTrak: spec.statTrak,
      nameTag: spec.nameTag,
      stickerSlots: spec.stickerSlots,
      charm: spec.charm ? { seed: spec.charm.seed } : null,
      vipItem: entry.vip,
    }),
    [entry, spec],
  );

  // O ponto de partida é o que veio do servidor nesta visita.
  const [initial] = useState(() =>
    props.mode === 'edit'
      ? formFromItem(formSpec, props.saved, new Map(props.labels.map((l) => [l.id, l])))
      : emptyForm(formSpec),
  );
  const draft = useDraft<ItemForm>(
    mode === 'edit' ? `item-editor:${props.uid}` : `item-editor:new:${entry.id}`,
    initial,
  );
  const form = draft.value;
  const [apiIssue, setApiIssue] = useState<FormIssue | null>(null);
  const [failure, setFailure] = useState<'network' | 'unexpected' | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [removing, setRemoving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();

  const issues = useMemo(() => {
    const local = validateForm(formSpec, form, { vip });
    return apiIssue && !local.some((i) => i.field === apiIssue.field)
      ? [...local, apiIssue]
      : local;
  }, [formSpec, form, vip, apiIssue]);
  const issueOf = (field: string) => issues.find((issue) => issue.field === field);

  const errorText = (issue: FormIssue) =>
    t(`errors.${issue.code}`, {
      min: formatRange(issue.range?.min),
      max: formatRange(issue.range?.max),
    });

  const item = useMemo(
    () => formToItem(formSpec, form, props.saved),
    [formSpec, form, props.saved],
  );
  const dirty = useMemo(
    () => JSON.stringify(item) !== JSON.stringify(formToItem(formSpec, initial, props.saved)),
    [item, formSpec, initial, props.saved],
  );

  function change(patch: Partial<ItemForm>) {
    setApiIssue(null);
    setFailure(null);
    draft.set({ ...form, ...patch });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (issues.length > 0) {
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setSaving(true);
    setFailure(null);
    // Guarda o rascunho antes: se a sessão expirou, ele volta depois do novo login.
    draft.persist();
    try {
      const response = await session.mutate(
        mode === 'edit' ? `/api/inventory/items/${props.uid}` : '/api/inventory/items',
        {
          method: mode === 'edit' ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ item }),
        },
      );
      if (response.status === 401) return;
      if (!response.ok) {
        const parsed = inventoryErrorSchema.safeParse(await response.json().catch(() => null));
        if (parsed.success) setApiIssue(issueFromApiError(parsed.data));
        else setFailure('unexpected');
        return;
      }
      const saved = inventoryItemSchema.parse(await response.json());
      draft.commit();
      inventory.notify(
        mode === 'edit' ? ti('saved', { name: entry.name }) : ti('added', { name: entry.name }),
        saved.uid,
      );
      router.push('/inventario');
      router.refresh();
    } catch {
      setFailure('network');
    } finally {
      setSaving(false);
    }
  }

  const itemIssue = issueOf('item');
  const lockedItem = entry.vip && !vip;
  const hasAttributes =
    !!spec.wear || !!spec.seed || spec.statTrak || spec.nameTag || spec.stickerSlots > 0;
  const lockedAttributes = !vip && (spec.statTrak || spec.nameTag);
  const visibleIssues = attempted ? issues : issues.filter((i) => i.code !== 'vip_required');
  const seedId = useId();
  const statTrakId = useId();
  const nameTagId = useId();

  return (
    <div
      className="grid grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] items-start gap-8 max-lg:grid-cols-1 max-lg:gap-5"
      data-testid="item-editor"
      data-hydrated={hydrated || undefined}
    >
      <div className="sticky top-[calc(var(--hdr-h)+20px)] max-lg:static">
        <ItemViewer
          item={item}
          name={entry.name}
          image={entry.image}
          always2d={spec.viewer === '2d'}
          stickers={form.stickers}
          charm={form.charm}
        />
      </div>

      <form
        ref={formRef}
        onSubmit={submit}
        noValidate
        className="grid gap-6"
        aria-label={t('attributes')}
      >
        {draft.restored ? (
          <Banner icon={HistoryIcon} tone="info" testId="draft-restored">
            <span className="flex-1">{t('restored')}</span>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              className="-my-1"
              onClick={draft.discard}
            >
              {t('discard')}
            </Button>
          </Banner>
        ) : null}

        {lockedItem ? (
          <Banner icon={LockIcon} tone="vip" testId="vip-item-lock">
            <span>
              <strong className="font-semibold">{t('vipLocked')}.</strong> {t('vipItem')}
            </span>
          </Banner>
        ) : lockedAttributes ? (
          <Banner icon={LockIcon} tone="vip" testId="vip-attributes-lock">
            <span>{t('vipAttributes')}</span>
          </Banner>
        ) : null}

        {!hasAttributes ? (
          <p className="text-[13.5px] text-muted-foreground">{t('noAttributes')}</p>
        ) : null}

        {spec.wear ? (
          <FloatField
            range={spec.wear}
            value={form.wear}
            onChange={(wear) => change({ wear: wear ?? Number.NaN })}
            error={issueOf('wear') && errorText(issueOf('wear') as FormIssue)}
          />
        ) : null}

        {spec.seed || spec.statTrak ? (
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {spec.seed ? (
              <FieldShell
                id={seedId}
                label={t('seed')}
                hint={t('seedRange', { min: spec.seed.min, max: spec.seed.max })}
                error={issueOf('seed') && errorText(issueOf('seed') as FormIssue)}
              >
                <DecimalInput
                  id={seedId}
                  value={form.seed}
                  decimals={0}
                  invalid={!!issueOf('seed')}
                  describedBy={describedBy(seedId, { error: issueOf('seed'), hint: true })}
                  onChange={(seed) => change({ seed: seed ?? Number.NaN })}
                  testId="field-seed"
                />
              </FieldShell>
            ) : null}
            {spec.statTrak ? (
              <FieldShell
                id={statTrakId}
                label={t('statTrak')}
                locked={!vip ? t('vipLocked') : undefined}
                error={
                  visibleIssues.some((i) => i.field === 'statTrak')
                    ? errorText(issueOf('statTrak') as FormIssue)
                    : undefined
                }
              >
                <div className="flex min-h-(--tap) items-center justify-between gap-3 rounded-md bg-surface-2 px-3">
                  <span aria-hidden="true" className="text-[14px]">
                    {form.statTrak ? t('statTrakOn') : t('statTrakOff')}
                  </span>
                  <Switch
                    id={statTrakId}
                    checked={form.statTrak}
                    onCheckedChange={(statTrak) => change({ statTrak })}
                    aria-describedby={describedBy(statTrakId, { locked: !vip })}
                    data-testid="field-stattrak"
                  />
                </div>
              </FieldShell>
            ) : null}
          </div>
        ) : null}

        {spec.nameTag ? (
          <FieldShell
            id={nameTagId}
            label={t('nameTag')}
            hint={t('nameTagHint')}
            locked={!vip ? t('vipLocked') : undefined}
            error={
              visibleIssues.some((i) => i.field === 'nameTag')
                ? errorText(issueOf('nameTag') as FormIssue)
                : undefined
            }
          >
            <TextInput
              id={nameTagId}
              value={form.nameTag}
              maxLength={20}
              placeholder={t('nameTagPlaceholder')}
              autoComplete="off"
              aria-invalid={visibleIssues.some((i) => i.field === 'nameTag') || undefined}
              aria-describedby={describedBy(nameTagId, {
                error: visibleIssues.some((i) => i.field === 'nameTag'),
                hint: true,
                locked: !vip,
              })}
              onChange={(event) => change({ nameTag: event.target.value })}
              data-testid="field-nametag"
            />
          </FieldShell>
        ) : null}

        {spec.stickerSlots > 0 ? (
          <StickersEditor
            stickers={form.stickers}
            slots={spec.stickerSlots}
            offset={spec.stickerOffset}
            issues={issues}
            errorText={errorText}
            onChange={(stickers) => change({ stickers })}
          />
        ) : null}

        {spec.charm ? (
          <CharmEditor
            charm={form.charm}
            spec={spec.charm}
            issue={issueOf('charm.seed') ?? issues.find((i) => i.field.startsWith('charm'))}
            errorText={errorText}
            onChange={(charm) => change({ charm })}
          />
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-1 grid gap-3 bg-background px-1 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] [mask-image:linear-gradient(to_bottom,transparent,#000_12px)]">
          {failure || (attempted && visibleIssues.length > 0) || (itemIssue && !lockedItem) ? (
            <p
              role="alert"
              className="flex items-start gap-2 text-[13px]"
              data-testid="editor-alert"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
              />
              {failure
                ? t(`errors.${failure}`)
                : itemIssue
                  ? errorText(itemIssue)
                  : t('issues', { count: visibleIssues.length })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {signedIn || session.status === 'unknown' ? (
              <Button
                type="submit"
                disabled={saving || lockedItem || (mode === 'edit' && !dirty)}
                className="min-w-44 max-md:flex-1"
                data-testid="save-item"
              >
                {saving ? t('saving') : mode === 'edit' ? t('save') : t('add')}
              </Button>
            ) : (
              <Button asChild className="max-md:flex-1">
                <a href={signInHref(pathname)} data-testid="sign-in-to-add">
                  <BrandIcon icon={siSteam} size={16} />
                  {t('signInToAdd')}
                </a>
              </Button>
            )}
            {mode === 'edit' && dirty ? (
              <Button type="button" variant="quiet" onClick={draft.discard}>
                {t('discard')}
              </Button>
            ) : null}
            {mode === 'edit' ? (
              <Button
                type="button"
                variant="quiet"
                className="ml-auto max-md:ml-0"
                onClick={() => setRemoving(true)}
                data-testid="remove-item"
              >
                {t('remove')}
              </Button>
            ) : null}
          </div>
        </div>
      </form>

      {mode === 'edit' && removing ? (
        <RemoveItemDialog
          uid={props.uid}
          name={entry.name}
          open={removing}
          onOpenChange={setRemoving}
          onRemoved={() => {
            draft.commit();
            router.push('/inventario' as Route);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

const formatRange = (value: number | undefined) =>
  value === undefined ? '' : formatDecimal(value, value >= 10 ? 0 : 2, { fixed: value < 10 });

/** Verdadeiro depois da hidratação: o E2E de desempenho mede até o editor responder. */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

function Banner({
  icon,
  tone,
  testId,
  children,
}: {
  icon: typeof LockIcon;
  tone: 'info' | 'vip';
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      data-icon-trigger
      className="flex animate-fade-up items-start gap-3 rounded-lg bg-surface px-4 py-3 text-[13px] leading-[1.55]"
    >
      <AnimatedIcon
        icon={icon}
        size={15}
        className={cn('mt-0.5', tone === 'vip' ? 'text-status-vip' : 'text-status-info')}
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}
