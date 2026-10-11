'use client';

import {
  CSRF_COOKIE,
  CSRF_HEADER,
  type CurrentSession,
  currentSessionSchema,
  type Profile,
  type VipStatus,
} from '@carmine/contracts';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { signInHref } from '@/lib/auth-links';
import { FIRST_STEPS_COOKIE, firstStepsCookie } from '@/lib/first-steps';

export type SessionStatus = 'authenticated' | 'anonymous' | 'unknown';

type SessionState = {
  status: SessionStatus;
  account: Profile | null;
  csrfToken: string | null;
  /** Período VIP da Conta; nulo sem sessão. Decide o cadeado dos Itens VIP (S04). */
  vip: VipStatus | null;
};

type SessionContextValue = SessionState & {
  /** Encerra a sessão na API (com o token CSRF); `false` se não deu. */
  signOut: () => Promise<boolean>;
  /** Mutação na API com o token CSRF; uma sessão expirada leva para entrar de novo. */
  mutate: (path: `/api/${string}`, init?: RequestInit) => Promise<Response>;
  firstSteps: { open: boolean; show: () => void; dismiss: () => void };
};

const SessionContext = createContext<SessionContextValue | null>(null);

function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function stateFrom(session: CurrentSession | null, status: SessionStatus): SessionState {
  return {
    status,
    account: session?.account ?? null,
    csrfToken: session?.csrfToken ?? null,
    vip: session?.vip ?? null,
  };
}

/**
 * A sessão do site no navegador. Nasce do que o servidor viu (sem piscar "Entrar" para quem
 * está logado) e, a cada carga de página, confirma em `/api/me` do próprio navegador: é essa
 * chamada que renova a sessão deslizante (ADR 0015). Sem o cookie CSRF (que vive junto com o
 * da sessão) não há sessão a renovar, e a chamada nem sai.
 */
export function SessionProvider({
  initialSession,
  initialStatus,
  firstStepsOpen,
  children,
}: {
  initialSession: CurrentSession | null;
  initialStatus: SessionStatus;
  firstStepsOpen: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState(() => stateFrom(initialSession, initialStatus));
  const [guideOpen, setGuideOpen] = useState(firstStepsOpen);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!readCookie(CSRF_COOKIE)) {
      setState((current) =>
        current.status === 'anonymous' ? current : stateFrom(null, 'anonymous'),
      );
      return;
    }
    const controller = new AbortController();
    fetch('/api/me', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setState(stateFrom(null, 'anonymous'));
          return;
        }
        // API fora do ar: fica o último estado conhecido, nunca "saiu".
        if (!response.ok) return;
        setState(stateFrom(currentSessionSchema.parse(await response.json()), 'authenticated'));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const csrfToken = state.csrfToken;

  const signOut = useCallback(async () => {
    const token = readCookie(CSRF_COOKIE) ?? csrfToken;
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { [CSRF_HEADER]: token } : {},
      });
      if (!response.ok) return false;
    } catch {
      return false;
    }
    setState(stateFrom(null, 'anonymous'));
    setGuideOpen(false);
    router.refresh();
    return true;
  }, [csrfToken, router]);

  const mutate = useCallback(
    async (path: `/api/${string}`, init: RequestInit = {}) => {
      const token = readCookie(CSRF_COOKIE) ?? csrfToken;
      const headers = new Headers(init.headers);
      if (token) headers.set(CSRF_HEADER, token);
      const response = await fetch(path, { ...init, headers });
      if (response.status === 401) {
        // Sessão expirou no meio da edição: o rascunho já está no navegador (useDraft) e volta
        // depois do novo login, nesta mesma página.
        setState(stateFrom(null, 'anonymous'));
        const search = window.location.search;
        router.push(signInHref(`${pathRef.current}${search}`, 'sessao-expirada') as Route);
      }
      return response;
    },
    [csrfToken, router],
  );

  const publicId = state.account?.publicId;
  const firstSteps = useMemo(
    () => ({
      open: guideOpen && state.status === 'authenticated',
      show: () => setGuideOpen(true),
      dismiss: () => {
        setGuideOpen(false);
        if (publicId !== undefined) {
          // biome-ignore lint/suspicious/noDocumentCookie: cookie simples lido pelo servidor; a Cookie Store API não existe em todos os navegadores.
          document.cookie = firstStepsCookie(readCookie(FIRST_STEPS_COOKIE), publicId);
        }
      },
    }),
    [guideOpen, publicId, state.status],
  );

  const value = useMemo(
    () => ({ ...state, signOut, mutate, firstSteps }),
    [state, signOut, mutate, firstSteps],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora do SessionProvider');
  return value;
}
