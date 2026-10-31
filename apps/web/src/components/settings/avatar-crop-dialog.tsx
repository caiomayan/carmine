'use client';

import type { AvatarState } from '@carmine/contracts/avatar';
import { AVATAR_MAX_UPLOAD_BYTES, AVATAR_MIN_PX } from '@carmine/contracts/avatar-rules';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import ReactCrop, {
  type Crop,
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
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
import {
  AVATAR_PICK_MAX_PIXELS,
  loadAvatarContracts,
  type NaturalCrop,
  naturalCrop,
  outputSide,
} from '@/lib/avatar';

const MAX_ZOOM = 3;

/** Desenha o quadrado do recorte (na imagem original) num canvas de `side` px. */
function draw(image: HTMLImageElement, crop: NaturalCrop, side: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('sem canvas');
  context.imageSmoothingQuality = 'high';
  // Dentro da imagem, mesmo com a conta de ponto flutuante nas bordas.
  const maxX = image.naturalWidth - crop.side;
  const maxY = image.naturalHeight - crop.side;
  const x = Math.min(Math.max(crop.x, 0), Math.max(maxX, 0));
  const y = Math.min(Math.max(crop.y, 0), Math.max(maxY, 0));
  context.drawImage(image, x, y, crop.side, crop.side, 0, 0, side, side);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * O recorte vira o arquivo enviado: WebP e, se o navegador não o gera ou ele passa de 1 MiB, JPEG em qualidades
 * menores. Passar pelo canvas já descarta EXIF e GPS (o servidor remove de novo).
 */
async function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  for (const [type, quality] of [
    ['image/webp', 0.9],
    ['image/jpeg', 0.88],
    ['image/jpeg', 0.7],
  ] as const) {
    const blob = await toBlob(canvas, type, quality);
    if (blob && blob.type === type && blob.size <= AVATAR_MAX_UPLOAD_BYTES) return blob;
  }
  return null;
}

/**
 * O recorte da foto de perfil, num diálogo: o quadrado com máscara circular (arrastar e as setas do teclado), o zoom e a
 * prévia nos tamanhos reais. Carregado só depois de escolher o arquivo (a biblioteca de recorte não pesa em nenhuma
 * página). Envia só o recorte e entrega o estado novo da foto, já no ar.
 */
export default function AvatarCropDialog({
  file,
  onClose,
  onSaved,
}: {
  file: File;
  onClose: () => void;
  onSaved: (state: AvatarState) => void;
}) {
  const t = useTranslations('settings.avatar');
  const { mutate } = useSession();
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [done, setDone] = useState<PixelCrop>();
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const big = useRef<HTMLCanvasElement>(null);
  const small = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const current = (): NaturalCrop | null => {
    const element = image.current;
    if (!element || !done || done.width === 0) return null;
    return naturalCrop(
      done,
      { width: element.width, height: element.height },
      { width: element.naturalWidth, height: element.naturalHeight },
      zoom,
    );
  };

  // A prévia: o mesmo recorte do arquivo, nos dois tamanhos em que a foto aparece.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refaz a prévia a cada recorte ou zoom.
  useEffect(() => {
    const element = image.current;
    const natural = current();
    if (!element || !natural) return;
    for (const [target, side] of [
      [big.current, 96],
      [small.current, 40],
    ] as const) {
      const context = target?.getContext('2d');
      if (!target || !context) continue;
      context.clearRect(0, 0, side, side);
      context.drawImage(draw(element, natural, side), 0, 0);
    }
  }, [done, zoom]);

  function loaded() {
    const element = image.current;
    if (!element) return;
    if (element.naturalWidth * element.naturalHeight > AVATAR_PICK_MAX_PIXELS) {
      setError(t('pickErrors.pixels'));
      return;
    }
    const { width, height } = element;
    const start = centerCrop(
      makeAspectCrop({ unit: '%', width: 80 }, 1, width, height),
      width,
      height,
    );
    setCrop(start);
    setDone(convertToPixelCrop(start, width, height));
  }

  async function send() {
    const element = image.current;
    const natural = current();
    if (!element || !natural) return;
    const side = outputSide(natural.side, AVATAR_MIN_PX);
    if (side === null) {
      setError(t('dialog.tooSmall', { min: AVATAR_MIN_PX }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await encode(draw(element, natural, side));
      if (!blob) {
        setError(t('errors.too_large'));
        return;
      }
      const response = await mutate('/api/me/avatar', {
        method: 'POST',
        headers: { 'content-type': blob.type },
        body: blob,
      });
      if (response.status === 401) return;
      const body: unknown = await response.json().catch(() => null);
      const { avatarErrorSchema, avatarStateSchema } = await loadAvatarContracts();
      if (response.ok) {
        onSaved(avatarStateSchema.parse(body));
        return;
      }
      const refused = avatarErrorSchema.safeParse(body);
      if (refused.success) {
        const code = refused.data.code;
        setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic'));
      } else {
        setError(t('errors.generic'));
      }
    } catch {
      setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        closeLabel={t('dialog.close')}
        className="gap-4 sm:max-w-md"
        data-testid="avatar-crop-dialog"
      >
        <div className="grid gap-2 pr-8">
          <DialogTitle>{t('dialog.title')}</DialogTitle>
          <DialogDescription className="text-body-sm leading-[1.55]">
            {t('dialog.description')}
          </DialogDescription>
        </div>

        <div className="overflow-hidden rounded-lg bg-surface-2">
          {src ? (
            <ReactCrop
              crop={crop}
              onChange={(next) => setCrop(next)}
              onComplete={(next) => setDone(next)}
              aspect={1}
              circularCrop
              keepSelection
              disabled={busy}
              ruleOfThirds={false}
              ariaLabels={{
                cropArea: t('dialog.cropLabel'),
                nwDragHandle: t('dialog.handles.nwDragHandle'),
                nDragHandle: t('dialog.handles.nDragHandle'),
                neDragHandle: t('dialog.handles.neDragHandle'),
                eDragHandle: t('dialog.handles.eDragHandle'),
                seDragHandle: t('dialog.handles.seDragHandle'),
                sDragHandle: t('dialog.handles.sDragHandle'),
                swDragHandle: t('dialog.handles.swDragHandle'),
                wDragHandle: t('dialog.handles.wDragHandle'),
              }}
              className="max-h-[50dvh] w-full justify-center"
            >
              {/* O zoom aproxima a imagem ao redor do centro; o recorte fica onde está. */}
              {/* biome-ignore lint/performance/noImgElement: uma prévia local (blob), o next/image não cabe aqui. */}
              <img
                ref={image}
                src={src}
                alt={t('dialog.imageAlt')}
                onLoad={loaded}
                onError={() => setError(t('pickErrors.unreadable'))}
                style={{ transform: `scale(${zoom})`, maxHeight: '50dvh' }}
                className="block max-w-full"
              />
            </ReactCrop>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <label className="flex min-w-48 flex-1 items-center gap-3 text-body-sm font-semibold">
            {t('dialog.zoom')}
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              disabled={busy}
              className="min-h-(--tap) flex-1 accent-foreground"
              data-testid="avatar-zoom"
            />
          </label>
          <div className="flex items-center gap-3" aria-hidden="true">
            <canvas
              ref={big}
              width={96}
              height={96}
              className="size-12 rounded-full bg-surface-2"
            />
            <canvas
              ref={small}
              width={40}
              height={40}
              className="size-5 rounded-full bg-surface-2"
            />
          </div>
          <span className="sr-only">{t('dialog.preview')}</span>
        </div>

        {error ? <FieldError>{error}</FieldError> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('dialog.cancel')}
          </Button>
          <Button onClick={send} disabled={busy || !done} data-testid="avatar-confirm">
            {busy ? t('dialog.sending') : t('dialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
