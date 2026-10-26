'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** O diálogo (e o contrato com Zod que ele lê) só é baixado depois do primeiro clique. */
const loadDialog = () => import('./avatar-report-dialog');
const ReportDialog = dynamic(() => loadDialog(), { ssr: false });

/**
 * "Denunciar foto" no Perfil de outra pessoa que tem foto própria (ADR 0022). Só aparece para quem está com a
 * sessão aberta; o diálogo vem sob demanda, então o botão quase não pesa na página.
 */
export function AvatarReportButton({ publicId, name }: { publicId: number; name: string }) {
  const t = useTranslations('profile.avatarReport');
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={button}
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void loadDialog()}
        onFocus={() => void loadDialog()}
        data-testid="avatar-report-open"
      >
        {t('open')}
      </Button>
      {open ? (
        <ReportDialog
          publicId={publicId}
          name={name}
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => button.current?.focus());
          }}
        />
      ) : null}
    </>
  );
}
