'use client';

import type { AvatarHistoryItem, AvatarState } from '@carmine/contracts/avatar';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import { Avatar } from '@/components/avatar';
import { useSession } from '@/components/session/session-provider';
import { FieldError } from '@/components/staff/fields';
import { Button } from '@/components/ui/button';
import { parseAvatarState } from '@/lib/api-guards';

type Change = 'chosen' | 'deleted' | 'reverted';

/** As recusas que têm texto próprio; qualquer outra cai no genérico. */
const KNOWN_ERRORS = ['punished', 'upload_blocked', 'not_in_history', 'disabled'] as const;

/**
 * "Trocar foto" (ADR 0025): o envio de uma foto nova e, abaixo, as últimas fotos que ficaram no ar, da mais nova para
 * a mais velha. Escolher uma volta com ela na hora e não conta nos limites de envio; "Apagar" a tira do histórico e do
 * armazenamento. "Voltar à foto da Steam" também fica aqui. Os limites de envio não mostram números. Carregado só
 * quando a pessoa abre o diálogo (as fotos do histórico vêm no estado da foto).
 */
export default function AvatarPhotosDialog({
  state,
  name,
  onClose,
  onChooseFile,
  onChanged,
}: {
  state: AvatarState;
  name: string;
  onClose: () => void;
  /** Abre a escolha do arquivo; o recorte é o diálogo seguinte. */
  onChooseFile: () => void;
  onChanged: (next: AvatarState, change: Change) => void;
}) {
  const t = useTranslations('settings.avatar');
  const format = useFormatter();
  const { mutate } = useSession();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });

  async function run(path: `/api/${string}`, method: 'POST' | 'DELETE', change: Change) {
    setBusy(true);
    setProblem(null);
    try {
      const response = await mutate(path, { method });
      if (response.status === 401) return;
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const next = parseAvatarState(body);
        if (!next) throw new Error('shape');
        setConfirming(null);
        onChanged(next, change);
        return;
      }
      const code =
        typeof body === 'object' && body !== null && 'code' in body ? String(body.code) : '';
      const known = KNOWN_ERRORS.find((candidate) => candidate === code);
      setProblem(known ? t(`errors.${known}`) : t('errors.generic'));
    } catch {
      setProblem(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  const choose = (item: AvatarHistoryItem) =>
    run(`/api/me/avatar/history/${item.id}`, 'POST', 'chosen');
  const erase = (item: AvatarHistoryItem) =>
    run(`/api/me/avatar/history/${item.id}`, 'DELETE', 'deleted');
  const useSteam = () => run('/api/me/avatar', 'DELETE', 'reverted');

  // O limite de envios e as travas valem para o envio; o histórico só fica de fora com Punição ou envio bloqueado.
  const blocked =
    !state.canUpload && state.cannotUploadReason ? t(`errors.${state.cannotUploadReason}`) : null;
  const historyBlocked = !state.canUseHistory && state.history.length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        closeLabel={t('dialog.close')}
        className="gap-5 sm:max-w-md"
        data-testid="avatar-photos-dialog"
      >
        <div className="grid gap-2 pr-8">
          <DialogTitle>{t('photos.title')}</DialogTitle>
          <DialogDescription className="text-body-sm leading-[1.55]">
            {t('photos.description')}
          </DialogDescription>
        </div>

        <div className="grid gap-2">
          <Button
            onClick={onChooseFile}
            disabled={busy || !state.canUpload}
            data-testid="avatar-upload-new"
          >
            {t('photos.upload')}
          </Button>
          {blocked ? (
            <p className="text-body-sm text-muted-foreground" data-testid="avatar-blocked">
              {blocked}
            </p>
          ) : null}
        </div>

        {state.history.length > 0 ? (
          <section className="grid gap-2" aria-labelledby="avatar-history-title">
            <h3 id="avatar-history-title" className="text-body-sm font-semibold">
              {t('photos.history')}
            </h3>
            <ul className="grid gap-1" data-testid="avatar-history">
              {state.history.map((item) => (
                <li
                  key={item.id}
                  data-current={item.current || undefined}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-2 px-3 py-2 transition-colors duration-(--dur-fast) ease-std data-current:shadow-[inset_0_0_0_100vmax_var(--fill-selected)]"
                >
                  <Avatar src={item.url} name={name} size={48} />
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <time dateTime={item.uploadedAt} className="text-body-sm font-semibold">
                      {when(item.uploadedAt)}
                    </time>
                    {item.current ? (
                      <span className="text-body-sm text-muted-foreground">
                        {t('photos.current')}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    {confirming === item.id ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => erase(item)}
                          disabled={busy}
                          aria-label={t('photos.eraseConfirmAria', { when: when(item.uploadedAt) })}
                          data-testid="avatar-erase-confirm"
                        >
                          {t('photos.eraseConfirm')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirming(null)}
                          disabled={busy}
                        >
                          {t('photos.eraseCancel')}
                        </Button>
                      </>
                    ) : (
                      <>
                        {item.current ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => choose(item)}
                            disabled={busy || !state.canUseHistory}
                            aria-label={t('photos.useAria', { when: when(item.uploadedAt) })}
                            data-testid="avatar-history-use"
                          >
                            {t('photos.use')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirming(item.id)}
                          disabled={busy}
                          aria-label={t('photos.eraseAria', { when: when(item.uploadedAt) })}
                          data-testid="avatar-history-erase"
                        >
                          {t('photos.erase')}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {historyBlocked ? (
              <p
                className="text-body-sm text-muted-foreground"
                data-testid="avatar-history-blocked"
              >
                {t('photos.historyBlocked')}
              </p>
            ) : (
              <p className="text-body-sm text-muted-foreground">{t('photos.eraseNote')}</p>
            )}
          </section>
        ) : null}

        {problem ? <FieldError>{problem}</FieldError> : null}

        <DialogFooter>
          {state.source === 'custom' ? (
            <Button
              variant="ghost"
              onClick={useSteam}
              disabled={busy}
              data-testid="avatar-revert"
              className="sm:mr-auto"
            >
              {t('useSteam')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('photos.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
