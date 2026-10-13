'use client';

import {
  type StaffServer,
  serverCodeSchema,
  serverHostname,
  serverShowcaseNameSchema,
  staffServerSchema,
} from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { normalizeServerCode } from '@/lib/staff';
import { ActionForm } from './action-form';
import { Field, TextInput } from './fields';
import { useStaffRequest } from './use-staff-request';

/**
 * Um Servidor Carmine no painel: nome de vitrine e código, com o hostname do jogo ao vivo
 * ("Carmine | Retake · Rotação | SP·2") enquanto a Staff digita.
 */
export function ServerEditor({ initial }: { initial: StaffServer }) {
  const t = useTranslations('staff.servers');
  const tm = useTranslations('staff');
  const id = useId();
  const { request } = useStaffRequest();
  const [server, setServer] = useState(initial);
  const [name, setName] = useState(initial.showcaseName ?? '');
  const [code, setCode] = useState(initial.code ?? '');
  const nameOk = serverShowcaseNameSchema.safeParse(name).success;
  const codeOk = serverCodeSchema.safeParse(code).success;
  const preview = nameOk && codeOk ? serverHostname(name.trim(), code.trim()) : null;

  return (
    <li
      data-testid="staff-server"
      data-server={server.name}
      className="grid gap-4 border-b border-line/60 py-5 first:pt-1 last:border-b-0"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-md font-semibold">{server.showcaseName ?? server.name}</h3>
        {server.code ? (
          <span className="rounded-xs bg-surface-2 px-1 py-px text-[11px] font-semibold tabular-nums">
            {server.code}
          </span>
        ) : null}
        <span className="text-[12.5px] text-muted-foreground tabular-nums">
          {server.name} · {tm(`servers.mode_${server.mode}`)} · {server.address}
        </span>
      </div>
      <ActionForm
        collapsed
        label={tm('servers.submit')}
        submitLabel={tm('servers.submit')}
        doneLabel={t('saved')}
        testId="server-form"
        validate={() => (nameOk && codeOk ? null : tm('errors.invalid_body'))}
        onSubmit={async (reason) => {
          const result = await request(
            `/api/staff/servers/${server.id}`,
            'PATCH',
            { showcaseName: name.trim(), code: code.trim(), reason },
            staffServerSchema,
          );
          if (result.ok) setServer(result.data);
          return result;
        }}
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
          <Field id={`${id}-name`} label={t('showcaseName')} hint={t('showcaseHint')}>
            <TextInput
              id={`${id}-name`}
              value={name}
              maxLength={40}
              aria-invalid={(name.length > 0 && !nameOk) || undefined}
              aria-describedby={`${id}-name-hint`}
              onChange={(event) => setName(event.target.value)}
              data-testid="server-showcase-name"
            />
          </Field>
          <Field id={`${id}-code`} label={t('code')} hint={t('codeHint')}>
            <TextInput
              id={`${id}-code`}
              value={code}
              maxLength={8}
              autoCapitalize="characters"
              aria-invalid={(code.length > 0 && !codeOk) || undefined}
              aria-describedby={`${id}-code-hint`}
              onChange={(event) => setCode(event.target.value)}
              onBlur={() => setCode((value) => normalizeServerCode(value))}
              className="tabular-nums"
              data-testid="server-code-input"
            />
          </Field>
        </div>
        <p className="text-[12.5px] text-muted-foreground" aria-live="polite">
          {t('hostname')}:{' '}
          <span className="font-semibold text-foreground" data-testid="hostname-preview">
            {preview ?? server.hostname ?? t('hostnamePending')}
          </span>
        </p>
      </ActionForm>
    </li>
  );
}
