'use client';

import {
  AVATAR_BLOCK_DAYS_MAX,
  AVATAR_BLOCK_DAYS_SUGGESTED,
  AVATAR_REASON_LABELS,
  AVATAR_REASONS,
  type AvatarReason,
  type StaffAccountAvatar,
  staffAccountAvatarSchema,
} from '@carmine/contracts/avatar';
import Link from 'next/link';
import { useId, useState } from 'react';
import { ActionForm } from '@/components/queue/action-form';
import { stamp } from '@/components/queue/bits';
import { staffPost } from '@/lib/staff-request';

/**
 * Confere o motivo e os dias de bloqueio da remoção. Os dias vêm como texto: em branco vale 0 (sem bloqueio), e o que
 * não é um inteiro de 0 ao máximo é erro (nunca vira 0 em silêncio).
 */
export function validateAvatarRemoval(
  reason: string,
  blockDays: string,
): { days: number } | { field: 'reason' | 'days'; message: string } {
  if (!reason) return { field: 'reason', message: 'Escolha o motivo da remoção.' };
  const text = blockDays.trim();
  const days = text === '' ? 0 : Number(text);
  if (!(Number.isInteger(days) && days >= 0 && days <= AVATAR_BLOCK_DAYS_MAX)) {
    return {
      field: 'days',
      message: `O bloqueio vai de 0 a ${AVATAR_BLOCK_DAYS_MAX} dias.`,
    };
  }
  return { days };
}

/**
 * A foto de perfil na ficha da Conta (ADR 0022, S25): a atual (a imagem vem da rota da Staff), o bloqueio de
 * reincidente, as remoções anteriores e "Remover a foto" direto, sem precisar de denúncia. Só a Staff vê o bloqueio.
 */
export function AccountAvatarPanel({
  publicId,
  initial,
}: {
  publicId: number;
  initial: StaffAccountAvatar;
}) {
  const id = useId();
  const [data, setData] = useState(initial);
  // O formulário fica montado depois de remover, para o aviso de feito não sumir junto com a foto.
  const [offerRemove] = useState(initial.current !== null);
  const [reason, setReason] = useState<AvatarReason | ''>('');
  const [blockDays, setBlockDays] = useState(String(AVATAR_BLOCK_DAYS_SUGGESTED));
  const reasonId = `${id}-reason`;
  const daysId = `${id}-days`;

  const validate = () => {
    const checked = validateAvatarRemoval(reason, blockDays);
    return 'message' in checked
      ? { message: checked.message, fieldId: checked.field === 'reason' ? reasonId : daysId }
      : null;
  };

  return (
    <section className="stp-card" aria-labelledby={`${id}-title`} data-testid="account-avatar">
      <h2 id={`${id}-title`} className="stp-card-h">
        Foto de perfil
      </h2>
      <div className="stp-avatar-panel">
        {data.current ? (
          // biome-ignore lint/performance/noImgElement: a foto vem da API do painel (rota autenticada).
          <img
            className="stp-photo-large stp-photo-sm"
            src={`/api/staff/avatars/${data.current.id}/image`}
            alt="A foto de perfil da Conta"
            width={112}
            height={112}
            loading="lazy"
            data-testid="account-avatar-image"
          />
        ) : null}
        <div className="stp-avatar-info">
          <p data-testid="account-avatar-state">
            {data.current ? (
              data.current.status === 'suspended' ? (
                <>
                  Foto própria fora do ar (suspensa por denúncias), enviada em{' '}
                  {stamp(data.current.uploadedAt)}. Decida na{' '}
                  <Link href="/fotos" prefetch={false} className="stp-link">
                    fila de fotos
                  </Link>
                  .
                </>
              ) : (
                `Foto própria no ar, enviada em ${stamp(data.current.uploadedAt)}.`
              )
            ) : (
              'A Conta usa a foto da Steam.'
            )}
          </p>
          {data.uploadBlockedUntil ? (
            <p data-testid="account-avatar-blocked">
              <b>Envio de foto bloqueado até {stamp(data.uploadBlockedUntil)}</b>
              <span className="stp-muted"> (o jogador só vê “indisponível”).</span>
            </p>
          ) : null}
          {offerRemove ? (
            <ActionForm
              label="Remover a foto"
              submitLabel="Remover a foto"
              doneLabel="Foto removida: a Conta voltou à foto da Steam."
              reasonLabel="Nota (vai para o log de auditoria)"
              testId="remove-avatar"
              kind="danger"
              validate={validate}
              onSubmit={(note) =>
                staffPost(
                  `/api/staff/accounts/${publicId}/avatar/remove`,
                  { decision: 'remove', reason, note, blockDays: Number(blockDays.trim() || 0) },
                  (value) => staffAccountAvatarSchema.parse(value),
                )
              }
              onSuccess={setData}
            >
              <label className="stp-label" htmlFor={reasonId}>
                Motivo da remoção
              </label>
              <select
                id={reasonId}
                className="stp-select"
                value={reason}
                onChange={(event) => setReason(event.target.value as AvatarReason)}
                data-testid="avatar-remove-reason"
              >
                <option value="">Escolha um motivo</option>
                {AVATAR_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {AVATAR_REASON_LABELS[value]}
                  </option>
                ))}
              </select>
              <label className="stp-label" htmlFor={daysId}>
                Dias sem poder enviar outra foto
                <span className="stp-label-count">
                  0 não bloqueia; sugerido {AVATAR_BLOCK_DAYS_SUGGESTED}
                </span>
              </label>
              <input
                id={daysId}
                className="stp-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={blockDays}
                onChange={(event) => setBlockDays(event.target.value)}
                data-testid="avatar-remove-days"
              />
            </ActionForm>
          ) : null}
        </div>
      </div>
      {data.removals.length > 0 ? (
        <div className="stp-avatar-removals-wrap">
          <h3 className="stp-section">Remoções anteriores</h3>
          <ol className="stp-avatar-removals" data-testid="account-avatar-removals">
            {data.removals.map((removal) => (
              <li key={removal.avatarId}>
                <b>{AVATAR_REASON_LABELS[removal.reason]}</b>
                <span className="stp-muted">
                  {' '}
                  · {stamp(removal.at)} · por {removal.by.displayName ?? '—'}
                </span>
                {removal.note ? <p>{removal.note}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
