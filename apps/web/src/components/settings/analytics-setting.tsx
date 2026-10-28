'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Switch } from '@/components/animate-ui/components/radix/switch';
import { useSession } from '@/components/session/session-provider';
import { FieldError } from '@/components/staff/fields';
import { setParticipation } from '@/lib/analytics-participation';

/**
 * "Participar da análise de uso" (A1d, ADR 0021): o direito de oposição da LGPD, ligado por padrão. Desligada, a
 * Conta deixa de entrar na análise: a contagem de páginas para na hora neste navegador, e os eventos do servidor
 * param em até 1 minuto (a API guarda a preferência por esse tempo). O interruptor muda na hora e volta atrás se a
 * API recusar.
 */
export function AnalyticsSetting({ participate }: { participate: boolean }) {
  const t = useTranslations('settings.analytics');
  const { mutate } = useSession();
  const switchId = useId();
  const [checked, setChecked] = useState(participate);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [announce, setAnnounce] = useState<'on' | 'off' | null>(null);

  async function toggle(next: boolean) {
    const before = checked;
    setChecked(next);
    setBusy(true);
    setFailed(false);
    try {
      const response = await mutate('/api/me/analytics', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ participate: next }),
      });
      if (response.status === 401) return;
      if (!response.ok) throw new Error(String(response.status));
      setParticipation(next);
      setAnnounce(next ? 'on' : 'off');
    } catch {
      setChecked(before);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-lg px-4 py-3 max-md:px-3" data-testid="analytics-setting">
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
          checked={checked}
          disabled={busy}
          onCheckedChange={toggle}
          data-testid="analytics-switch"
        />
      </label>
      <p className="max-w-[60ch] text-body-sm text-muted-foreground">{t('detail')}</p>
      <p
        aria-live="polite"
        className="text-body-sm text-muted-foreground"
        data-testid="analytics-status"
      >
        {announce === 'on' ? t('announceOn') : announce === 'off' ? t('announceOff') : null}
      </p>
      {failed ? <FieldError>{t('failed')}</FieldError> : null}
    </div>
  );
}
