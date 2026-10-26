'use client';

import { AVATAR_REASONS, type AvatarReason } from '@carmine/contracts/avatar';
import { useFormatter, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import { useSession } from '@/components/session/session-provider';
import { FieldError } from '@/components/staff/fields';
import { Button } from '@/components/ui/button';
import { loadAvatarContracts } from '@/lib/avatar';

/**
 * A denúncia da foto de perfil: o motivo (a mesma lista da Staff) e o envio. A resposta nunca diz se a foto saiu do
 * ar; a pessoa só vê que a denúncia foi recebida.
 */
export default function AvatarReportDialog({
  publicId,
  name,
  onClose,
}: {
  publicId: number;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations('profile.avatarReport');
  const format = useFormatter();
  const { mutate } = useSession();
  const group = useId();
  const [reason, setReason] = useState<AvatarReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const response = await mutate(`/api/profiles/${publicId}/avatar-report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (response.status === 401) return;
      if (response.ok) {
        setSent(true);
        return;
      }
      const { avatarErrorSchema } = await loadAvatarContracts();
      const refused = avatarErrorSchema.safeParse(await response.json().catch(() => null));
      setError(
        refused.success
          ? t(`errors.${refused.data.code}`, {
              limit: 3,
              when: refused.data.retryAfter
                ? format.dateTime(new Date(refused.data.retryAfter), {
                    dateStyle: 'long',
                    timeStyle: 'short',
                    timeZone: 'America/Sao_Paulo',
                  })
                : '',
            })
          : t('errors.generic'),
      );
    } catch {
      setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        closeLabel={t('close')}
        className="gap-5 sm:max-w-md"
        data-testid="avatar-report-dialog"
      >
        <div className="grid gap-2 pr-8">
          <DialogTitle>{t('title', { name })}</DialogTitle>
          <DialogDescription className="text-body-sm leading-[1.55]">
            {sent ? t('sent') : t('description', { name })}
          </DialogDescription>
        </div>

        {sent ? null : (
          <fieldset className="m-0 grid gap-1 border-0 p-0">
            <legend className="sr-only">{t('reasonLabel')}</legend>
            {AVATAR_REASONS.map((value) => (
              <label
                key={value}
                className="flex min-h-(--tap) cursor-pointer items-center gap-3 rounded-lg px-3 text-body-sm transition-colors duration-(--dur-fast) hover:bg-(--fill-hover) has-checked:bg-(--fill-active)"
              >
                <input
                  type="radio"
                  name={group}
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  disabled={busy}
                  className="size-4 accent-foreground"
                  data-testid={`avatar-report-${value}`}
                />
                {t(`reasons.${value}`)}
              </label>
            ))}
          </fieldset>
        )}

        {error ? <FieldError>{error}</FieldError> : null}

        <DialogFooter>
          {sent ? (
            <Button onClick={onClose} data-testid="avatar-report-done">
              {t('done')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                {t('cancel')}
              </Button>
              <Button onClick={submit} disabled={busy || !reason} data-testid="avatar-report-send">
                {busy ? t('sending') : t('send')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
