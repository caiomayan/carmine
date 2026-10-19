'use client';

import type { DiscordLinkResult, DiscordLinkStatus } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { siDiscord } from 'simple-icons';
import { BrandIcon } from '@/components/icons/brand-icon';
import { useSession } from '@/components/session/session-provider';
import { FieldError } from '@/components/staff/fields';
import { Button } from '@/components/ui/button';

type Loaded =
  | { kind: 'loaded'; status: DiscordLinkStatus }
  | { kind: 'loading' }
  | { kind: 'failed' };

type Notice = {
  tone: 'ok' | 'error';
  text: DiscordLinkResult | 'desvinculado' | 'desvincular-falhou';
};

const SUCCESS = new Set<string>(['vinculado', 'desvinculado']);
const RESULTS = new Set<string>([
  'vinculado',
  'em-uso',
  'conta-ja-vinculada',
  'cancelado',
  'invalido',
  'indisponivel',
  'desligado',
  'sem-sessao',
]);

/** O resultado do vínculo volta na URL como `?discord=<resultado>`; lê uma vez e limpa a URL. */
function takeResultFromUrl(): DiscordLinkResult | null {
  const url = new URL(window.location.href);
  const result = url.searchParams.get('discord');
  if (result === null) return null;
  url.searchParams.delete('discord');
  window.history.replaceState(window.history.state, '', url);
  return RESULTS.has(result) ? (result as DiscordLinkResult) : null;
}

function readStatus(body: unknown): DiscordLinkStatus | null {
  if (typeof body !== 'object' || body === null) return null;
  const { enabled, link } = body as { enabled?: unknown; link?: unknown };
  if (typeof enabled !== 'boolean') return null;
  if (link === null) return { enabled, link: null };
  const { username, linkedAt } = (link ?? {}) as { username?: unknown; linkedAt?: unknown };
  return typeof username === 'string' && typeof linkedAt === 'string'
    ? { enabled, link: { username, linkedAt } }
    : null;
}

/**
 * Vínculo do Discord (S15), só para o dono do Perfil. É um vínculo, não um login: a Steam segue
 * sendo a única autenticação. O botão leva ao Discord por navegação (a API cuida do `state`); sem a
 * integração configurada, ele aparece desabilitado.
 */
export function DiscordSetting() {
  const t = useTranslations('profile.settings.discord');
  const { account, mutate } = useSession();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const linkButton = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const result = takeResultFromUrl();
    if (result) setNotice({ tone: SUCCESS.has(result) ? 'ok' : 'error', text: result });
    let cancelled = false;
    fetch('/api/discord/link', { credentials: 'same-origin' })
      .then(async (response) => {
        const status = response.ok ? readStatus(await response.json()) : null;
        if (!cancelled) setLoaded(status ? { kind: 'loaded', status } : { kind: 'failed' });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!account) return null;

  async function unlink() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await mutate('/api/discord/link', { method: 'DELETE' });
      if (response.status === 401) return;
      if (!response.ok) throw new Error(String(response.status));
      setLoaded((current) =>
        current.kind === 'loaded'
          ? { kind: 'loaded', status: { ...current.status, link: null } }
          : current,
      );
      setNotice({ tone: 'ok', text: 'desvinculado' });
      // O botão de vincular só passa a existir depois da renderização.
      requestAnimationFrame(() => linkButton.current?.focus());
    } catch {
      setNotice({ tone: 'error', text: 'desvincular-falhou' });
    } finally {
      setBusy(false);
    }
  }

  const status = loaded.kind === 'loaded' ? loaded.status : null;
  const returnTo = encodeURIComponent(`/${account.publicId}`);

  return (
    <div className="grid gap-3 rounded-lg px-4 py-3 max-md:px-3" data-testid="discord-setting">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <BrandIcon icon={siDiscord} size={15} />
            {t('title')}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {status?.link ? t('linked', { username: status.link.username }) : t('description')}
          </p>
        </div>
        {loaded.kind === 'loading' ? (
          <Button variant="ghost" size="sm" disabled>
            {t('loading')}
          </Button>
        ) : status?.link ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={unlink}
            disabled={busy}
            data-testid="discord-unlink"
          >
            {t('unlink')}
          </Button>
        ) : status?.enabled ? (
          <Button asChild variant="ghost" size="sm">
            <a
              ref={linkButton}
              href={`/api/auth/discord/link?returnTo=${returnTo}`}
              data-testid="discord-link"
            >
              {t('link')}
            </a>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled data-testid="discord-link-disabled">
            {t('link')}
          </Button>
        )}
      </div>

      {status && !status.enabled && !status.link ? (
        <p className="text-[12.5px] text-muted-foreground">{t('unavailable')}</p>
      ) : null}
      {loaded.kind === 'failed' ? <FieldError>{t('loadFailed')}</FieldError> : null}

      <div aria-live="polite">
        {notice?.tone === 'ok' ? (
          <p className="text-[13px]" data-testid="discord-notice">
            {t(`results.${notice.text}`)}
          </p>
        ) : null}
      </div>
      {notice?.tone === 'error' ? (
        <div data-testid="discord-notice" role="alert">
          <FieldError>{t(`results.${notice.text}`)}</FieldError>
        </div>
      ) : null}
    </div>
  );
}
