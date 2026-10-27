'use client';

import { AVATAR_REASON_LABELS, type StaffAccountAvatar } from '@carmine/contracts/avatar';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { RemoveAvatarForm } from './avatar-decision';

/**
 * A foto de perfil na ficha da Conta (ADR 0022): a atual (a imagem vem da rota da Staff), o bloqueio de reincidente,
 * as remoções anteriores e "Remover a foto" em um clique, sem precisar de denúncia. Só a Staff vê o bloqueio.
 */
export function AccountAvatarPanel({
  publicId,
  initial,
}: {
  publicId: number;
  initial: StaffAccountAvatar;
}) {
  const t = useTranslations('staff.account.avatar');
  const format = useFormatter();
  const [data, setData] = useState(initial);
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <section
      aria-labelledby="foto-de-perfil"
      className="mt-8 grid gap-4 rounded-xl bg-surface p-4"
      data-testid="account-avatar"
    >
      <h3 id="foto-de-perfil" className="text-md font-semibold">
        {t('title')}
      </h3>
      <div className="flex flex-wrap items-start gap-4">
        {data.current ? (
          // biome-ignore lint/performance/noImgElement: a imagem é privada e não pode passar pelo otimizador.
          <img
            src={`/api/staff/avatars/${data.current.id}/image`}
            alt={t('imageAlt')}
            width={128}
            height={128}
            loading="lazy"
            className="size-32 rounded-xl bg-surface-2 object-cover"
            data-testid="account-avatar-image"
          />
        ) : null}
        <div className="grid min-w-0 flex-1 content-start gap-2 text-body-sm">
          <p data-testid="account-avatar-state">
            {data.current
              ? data.current.status === 'suspended'
                ? t('suspended', { when: when(data.current.uploadedAt) })
                : t('active', { when: when(data.current.uploadedAt) })
              : t('steam')}
          </p>
          {data.uploadBlockedUntil ? (
            <p className="font-semibold" data-testid="account-avatar-blocked">
              {t('blockedUntil', { when: when(data.uploadBlockedUntil) })}
            </p>
          ) : null}
          {data.current ? (
            <RemoveAvatarForm
              publicId={publicId}
              onDone={(after: StaffAccountAvatar) => setData(after)}
            />
          ) : null}
        </div>
      </div>
      {data.removals.length > 0 ? (
        <div className="grid gap-1.5">
          <h4 className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
            {t('removals')}
          </h4>
          <ol className="grid gap-1 text-body-sm" data-testid="account-avatar-removals">
            {data.removals.map((removal) => (
              <li key={removal.avatarId}>
                {t('removal', {
                  when: when(removal.at),
                  reason: AVATAR_REASON_LABELS[removal.reason],
                  note: removal.note,
                  name: removal.by.displayName ?? '—',
                })}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
