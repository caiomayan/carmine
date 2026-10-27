'use client';

import type { StaffErrorCode } from '@carmine/contracts';
import { staffErrorSchema } from '@carmine/contracts/staff';
import { useCallback, useState } from 'react';
import { useSession } from '@/components/session/session-provider';

export type StaffResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: StaffErrorCode | 'unknown' };

/**
 * Uma mutação do painel da Staff: JSON com o token CSRF (pelo `mutate` da sessão, que leva a
 * entrar de novo se a sessão caiu), resposta validada pelo contrato e erro pelo código estável.
 */
export function useStaffRequest() {
  const { mutate } = useSession();
  const [pending, setPending] = useState(false);

  const request = useCallback(
    async <T>(
      path: `/api/staff/${string}`,
      method: 'POST' | 'PUT' | 'PATCH',
      body: unknown,
      schema: { parse: (value: unknown) => T },
    ): Promise<StaffResult<T>> => {
      setPending(true);
      try {
        const response = await mutate(path, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json: unknown = await response.json().catch(() => null);
        if (response.ok) return { ok: true, data: schema.parse(json) };
        const error = staffErrorSchema.safeParse(json);
        return { ok: false, code: error.success ? error.data.code : 'unknown' };
      } catch {
        return { ok: false, code: 'unknown' };
      } finally {
        setPending(false);
      }
    },
    [mutate],
  );

  return { request, pending };
}
