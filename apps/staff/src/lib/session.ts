import { type CurrentSession, currentSessionSchema } from '@carmine/contracts';
import { apiGet } from './api';

export type PanelSession =
  | { status: 'anonymous' }
  | { status: 'unavailable' }
  | { status: 'no-access'; session: CurrentSession }
  | {
      status: 'staff';
      session: CurrentSession & { staffRole: NonNullable<CurrentSession['staffRole']> };
    };

/**
 * A sessão do painel: quem não entrou vai para `/entrar`; quem entrou sem papel de Staff não vê nada (a API também
 * recusa nas rotas da Staff, isto é só a primeira linha). Sem sessão válida a API responde 401.
 */
export async function getPanelSession(): Promise<PanelSession> {
  const result = await apiGet<unknown>('/api/me');
  if (!result.ok) return { status: result.status === 401 ? 'anonymous' : 'unavailable' };
  const parsed = currentSessionSchema.safeParse(result.data);
  if (!parsed.success) return { status: 'unavailable' };
  const session = parsed.data;
  if (!session.staffRole) return { status: 'no-access', session };
  return { status: 'staff', session: { ...session, staffRole: session.staffRole } };
}
