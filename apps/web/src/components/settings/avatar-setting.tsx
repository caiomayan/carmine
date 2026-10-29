'use client';

import type { AvatarState } from '@carmine/contracts/avatar';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { useSession } from '@/components/session/session-provider';
import { FieldError } from '@/components/staff/fields';
import { Button } from '@/components/ui/button';
import { parseAvatarState } from '@/lib/api-guards';
import { AVATAR_PICK_TYPES, pickProblem } from '@/lib/avatar';

/** O diálogo de recorte (e a biblioteca dele) só é baixado depois que a pessoa escolhe um arquivo. */
const loadDialog = () => import('./avatar-crop-dialog');
const CropDialog = dynamic(() => loadDialog(), { ssr: false });
/** O diálogo "Trocar foto" (envio, histórico e voltar à Steam) também só vem ao abrir. */
const loadPhotosDialog = () => import('./avatar-photos-dialog');
const PhotosDialog = dynamic(() => loadPhotosDialog(), { ssr: false });

/** O avatar que todos veem agora: a foto própria no ar ou, senão, a da Steam. */
export function effectiveAvatarUrl(state: AvatarState): string | null {
  return state.source === 'custom' && state.custom?.status === 'active'
    ? state.custom.url
    : state.steamAvatarUrl;
}

/**
 * A foto de perfil própria (ADR 0022 e 0025), em Configurações > Perfil: a atual e "Trocar foto". Sem nenhuma foto
 * ainda, "Enviar foto" vai direto à escolha do arquivo (recorta num diálogo e envia; publica na hora); com foto ou
 * histórico, abre o diálogo com o envio, as últimas fotos e "Voltar à foto da Steam". Some inteira quando a
 * funcionalidade está desligada neste ambiente. Os schemas Zod só vêm quando a resposta da API precisa ser lida.
 */
export function AvatarSetting() {
  const t = useTranslations('settings.avatar');
  const format = useFormatter();
  const router = useRouter();
  const { account, updateAccount } = useSession();
  const [state, setState] = useState<AvatarState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<'saved' | 'reverted' | 'chosen' | 'deleted' | null>(null);
  const [photosOpen, setPhotosOpen] = useState(false);
  /** O arquivo foi escolhido de dentro do diálogo de fotos: cancelar o recorte volta para ele. */
  const fromPhotos = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const pickButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/me/avatar', { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        // Conferência leve (sem o Zod, que pesaria ~30 kB na primeira carga de Configurações).
        const next = parseAvatarState(await response.json());
        if (!next) throw new Error('shape');
        if (!cancelled) setState(next);
      } catch {
        // Sem a resposta, a linha não aparece (nunca uma foto que talvez não valha).
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!account || !loaded || !state?.enabled) return null;

  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });

  function apply(next: AvatarState) {
    setState(next);
    updateAccount({ avatarUrl: effectiveAvatarUrl(next) });
    router.refresh();
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // O mesmo arquivo pode ser escolhido de novo depois de cancelar.
    event.target.value = '';
    if (!file) return;
    const found = pickProblem(file);
    if (found) {
      setProblem(t(`pickErrors.${found}`));
      return;
    }
    setProblem(null);
    setNotice(null);
    fromPhotos.current = photosOpen;
    setPhotosOpen(false);
    setPicked(file);
  }

  const suspended = state.custom?.status === 'suspended';
  const hasCustom = state.custom !== null;
  /** Há o que mostrar no diálogo (uma foto no ar ou fotos no histórico); senão "Enviar foto" abre o arquivo direto. */
  const hasPhotos = hasCustom || state.history.length > 0;
  const hint = suspended ? t('suspended') : hasCustom ? t('customHint') : t('steamHint');
  const blocked =
    !state.canUpload && state.cannotUploadReason ? t(`errors.${state.cannotUploadReason}`) : null;

  return (
    <div className="grid gap-3 rounded-lg px-4 py-3 max-md:px-3" data-testid="avatar-setting">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={account.avatarUrl} name={account.displayName} size={64} />
          <div className="grid min-w-0 gap-0.5">
            <h3 id="foto" className="scroll-mt-24 text-body font-semibold">
              {t('title')}
            </h3>
            <p className="text-body-sm text-muted-foreground">{hint}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            ref={pickButton}
            variant="ghost"
            size="sm"
            onClick={() => (hasPhotos ? setPhotosOpen(true) : input.current?.click())}
            onPointerEnter={() => void (hasPhotos ? loadPhotosDialog() : loadDialog())}
            onFocus={() => void (hasPhotos ? loadPhotosDialog() : loadDialog())}
            disabled={!hasPhotos && !state.canUpload}
            data-testid="avatar-pick"
          >
            {hasPhotos ? t('change') : t('send')}
          </Button>
          <input
            ref={input}
            type="file"
            accept={AVATAR_PICK_TYPES.join(',')}
            onChange={choose}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="avatar-file"
          />
        </div>
      </div>

      {blocked ? (
        <p className="text-body-sm text-muted-foreground" data-testid="avatar-blocked">
          {blocked}
        </p>
      ) : (
        <p className="text-body-sm text-muted-foreground">
          {t('guidance')} {t('gameNote')}
        </p>
      )}

      {state.removal && !hasCustom ? (
        <p className="text-body-sm" data-testid="avatar-removed">
          {t('removed', {
            when: when(state.removal.at),
            reason: t(`reasons.${state.removal.reason}`),
          })}
        </p>
      ) : null}

      <div aria-live="polite" className={notice ? '' : 'sr-only'}>
        {notice ? (
          <p className="text-body-sm" data-testid="avatar-notice">
            {t(notice)}
          </p>
        ) : null}
      </div>
      {problem ? <FieldError>{problem}</FieldError> : null}

      {photosOpen ? (
        <PhotosDialog
          state={state}
          name={account.displayName}
          onClose={() => {
            setPhotosOpen(false);
            requestAnimationFrame(() => pickButton.current?.focus());
          }}
          onChooseFile={() => input.current?.click()}
          onChanged={(next, change) => {
            apply(next);
            setNotice(change);
            // Escolher ou voltar à Steam resolve; apagar uma foto deixa o diálogo aberto para a próxima.
            if (change !== 'deleted') {
              setPhotosOpen(false);
              requestAnimationFrame(() => pickButton.current?.focus());
            }
          }}
        />
      ) : null}

      {picked ? (
        <CropDialog
          file={picked}
          onClose={() => {
            setPicked(null);
            if (fromPhotos.current) setPhotosOpen(true);
            else requestAnimationFrame(() => pickButton.current?.focus());
          }}
          onSaved={(next) => {
            setPicked(null);
            fromPhotos.current = false;
            apply(next);
            setNotice('saved');
            requestAnimationFrame(() => pickButton.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}
