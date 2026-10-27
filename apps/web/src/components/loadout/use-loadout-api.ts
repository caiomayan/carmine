'use client';

import type {
  AssignInput,
  CreatePresetInput,
  EquipInput,
  LoadoutChange,
  LoadoutErrorCode,
  UnequipInput,
} from '@carmine/contracts';
import { useMemo } from 'react';
import { useSession } from '@/components/session/session-provider';

/**
 * Falha de uma chamada do Loadout ou dos Presets. `code` vem do contrato (`LoadoutErrorCode`);
 * `network` é a API fora do ar, e `session` a sessão que expirou (o `mutate` já leva a entrar).
 */
export class LoadoutApiError extends Error {
  constructor(readonly code: LoadoutErrorCode | 'network' | 'session' | 'unexpected') {
    super(code);
  }
}

async function failure(response: Response): Promise<LoadoutApiError> {
  if (response.status === 401) return new LoadoutApiError('session');
  const { loadoutErrorSchema } = await import('@carmine/contracts/loadout');
  const parsed = loadoutErrorSchema.safeParse(await response.json().catch(() => null));
  return new LoadoutApiError(parsed.success ? parsed.data.code : 'unexpected');
}

/** As mutações do Loadout (S05), com o token CSRF da sessão. */
export function useLoadoutApi() {
  const { mutate } = useSession();

  return useMemo(() => {
    async function send(path: `/api/${string}`, method: string, body?: unknown) {
      let response: Response;
      try {
        response = await mutate(path, {
          method,
          ...(body === undefined
            ? {}
            : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        });
      } catch {
        throw new LoadoutApiError('network');
      }
      if (!response.ok) throw await failure(response);
      return response;
    }

    const change = async (path: `/api/${string}`, body: unknown): Promise<LoadoutChange> => {
      const json = await (await send(path, 'POST', body)).json();
      const { loadoutChangeSchema } = await import('@carmine/contracts/loadout');
      return loadoutChangeSchema.parse(json);
    };

    return {
      equip: (input: EquipInput) => change('/api/loadout/equip', input),
      unequip: (input: UnequipInput) => change('/api/loadout/unequip', input),
      assign: (input: AssignInput) => change('/api/loadout/assign', input),
      createPreset: async (input: CreatePresetInput) => {
        await send('/api/presets', 'POST', input);
      },
      renamePreset: async (id: string, name: string) => {
        await send(`/api/presets/${id}`, 'PATCH', { name });
      },
      activatePreset: async (id: string) => {
        await send(`/api/presets/${id}/activate`, 'POST');
      },
      deletePreset: async (id: string) => {
        await send(`/api/presets/${id}`, 'DELETE');
      },
      addItem: async (item: unknown): Promise<string> => {
        const response = await send('/api/inventory/items', 'POST', { item });
        const json = await response.json();
        const { inventoryItemSchema } = await import('@carmine/contracts/inventory');
        return inventoryItemSchema.parse(json).uid;
      },
    };
  }, [mutate]);
}
