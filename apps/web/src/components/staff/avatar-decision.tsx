'use client';

import {
  AVATAR_BLOCK_DAYS_MAX,
  AVATAR_REASON_LABELS,
  AVATAR_REASONS,
  type AvatarReason,
  type StaffAccountAvatar,
  type StaffAvatarCase,
  staffAccountAvatarSchema,
  staffAvatarCaseSchema,
} from '@carmine/contracts/avatar';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SimpleSelect } from '@/components/ui/select';
import { ActionForm } from './action-form';
import { Field, TextInput } from './fields';
import { useStaffRequest } from './use-staff-request';

/** Manter a foto: ela volta ao ar se estava suspensa e as denúncias são arquivadas. */
export function KeepAvatarForm({
  avatarId,
  onDone,
}: {
  avatarId: string;
  onDone: (decided: StaffAvatarCase) => void;
}) {
  const t = useTranslations('staff.photos.keep');
  const { request } = useStaffRequest();
  return (
    <ActionForm
      collapsed
      label={t('open')}
      submitLabel={t('submit')}
      doneLabel={t('done')}
      testId="keep-avatar"
      onSubmit={async (note) => {
        const result = await request(
          `/api/staff/avatars/${avatarId}/decision`,
          'POST',
          { decision: 'keep', note },
          staffAvatarCaseSchema,
        );
        if (result.ok) onDone(result.data);
        return result;
      }}
    />
  );
}

/**
 * Remover a foto (pela denúncia ou direto da ficha da Conta): o motivo, o bloqueio de novos envios (em branco, a regra:
 * 7 dias na primeira remoção e 30 na reincidência em 90 dias; 0 não bloqueia) e a nota para o log de auditoria. Pede
 * confirmação: a Conta volta à foto da Steam na hora.
 */
export function RemoveAvatarForm(
  props:
    | { avatarId: string; onDone: (decided: StaffAvatarCase) => void }
    | { publicId: number; onDone: (after: StaffAccountAvatar) => void },
) {
  const t = useTranslations('staff.photos.remove');
  const { request } = useStaffRequest();
  const id = useId();
  const [reason, setReason] = useState<AvatarReason | ''>('');
  const [blockDays, setBlockDays] = useState('');

  const days = blockDays.trim() === '' ? undefined : Number(blockDays);
  const validate = () => {
    if (!reason) return t('reasonRequired');
    if (
      days !== undefined &&
      !(Number.isInteger(days) && days >= 0 && days <= AVATAR_BLOCK_DAYS_MAX)
    ) {
      return t('blockInvalid', { max: AVATAR_BLOCK_DAYS_MAX });
    }
    return null;
  };

  return (
    <ActionForm
      collapsed
      label={t('open')}
      submitLabel={t('submit')}
      doneLabel={t('done')}
      testId="remove-avatar"
      validate={validate}
      confirmation={{
        title: t('confirm.title'),
        description: t('confirm.description'),
        confirmLabel: t('confirm.label'),
      }}
      onSubmit={async (note) => {
        const body = {
          decision: 'remove',
          reason,
          note,
          ...(days !== undefined && { blockDays: days }),
        };
        if ('avatarId' in props) {
          const result = await request(
            `/api/staff/avatars/${props.avatarId}/decision`,
            'POST',
            body,
            staffAvatarCaseSchema,
          );
          if (result.ok) props.onDone(result.data);
          return result;
        }
        const result = await request(
          `/api/staff/accounts/${props.publicId}/avatar/remove`,
          'POST',
          body,
          staffAccountAvatarSchema,
        );
        if (result.ok) props.onDone(result.data);
        return result;
      }}
    >
      <Field id={`${id}-reason`} label={t('reason')}>
        <SimpleSelect
          id={`${id}-reason`}
          value={reason}
          onValueChange={(value) => setReason(value as AvatarReason)}
          placeholder={t('reasonPlaceholder')}
          options={AVATAR_REASONS.map((value) => ({
            value,
            label: AVATAR_REASON_LABELS[value],
          }))}
          data-testid="avatar-remove-reason"
        />
      </Field>
      <Field id={`${id}-days`} label={t('blockDays')} hint={t('blockHint')}>
        <TextInput
          id={`${id}-days`}
          type="number"
          inputMode="numeric"
          min={0}
          max={AVATAR_BLOCK_DAYS_MAX}
          step={1}
          value={blockDays}
          onChange={(event) => setBlockDays(event.target.value)}
          placeholder={t('blockPlaceholder')}
          data-testid="avatar-remove-days"
        />
      </Field>
    </ActionForm>
  );
}
