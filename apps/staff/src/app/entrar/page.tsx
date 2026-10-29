import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getPanelSession } from '@/lib/session';
import './entrar.css';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  'sem-acesso': 'Esta Conta não tem papel de Staff. Peça ao Dono para liberar o seu acesso.',
  cancelado: 'O login foi cancelado na Steam.',
  invalido: 'Não foi possível confirmar o login com a Steam. Tente de novo.',
  indisponivel: 'A Steam ou a API não responderam. Tente de novo em instantes.',
  limite: 'Muitas tentativas. Espere um minuto e tente de novo.',
};

/** Só um caminho interno do painel volta depois do login. */
const safeBack = (value: string | undefined) =>
  value && /^\/(?!\/)[^\s]*$/.test(value) && !value.startsWith('/entrar') ? value : '/';

/**
 * A tela de entrada do painel (pública, atrás do Access): o login Steam do painel (`/api/auth/steam/staff/login`, ADR
 * 0015). Quem já tem sessão de Staff segue direto; uma Conta sem papel de Staff vê "sem acesso", sem sessão.
 */
export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; voltar?: string }>;
}) {
  const { erro, voltar } = await searchParams;
  const back = safeBack(voltar);
  const session = await getPanelSession();
  if (session.status === 'staff') redirect(back);

  const message = erro ? (MESSAGES[erro] ?? MESSAGES.indisponivel) : null;
  return (
    <main className="stp-entry" data-testid="staff-entry">
      <section className="stp-entry-card" aria-labelledby="stp-entry-title">
        <span className="stp-entry-mark" aria-hidden="true">
          C
        </span>
        <h1 id="stp-entry-title">Painel da Staff</h1>
        <p>Entre com a Steam. Só Contas com papel de Staff passam.</p>
        {message ? (
          <p role="alert" className="stp-entry-error" data-testid="staff-entry-error">
            {message}
          </p>
        ) : null}
        <a
          className="stp-entry-button"
          href={`/api/auth/steam/staff/login?returnTo=${encodeURIComponent(back)}`}
        >
          Entrar com a Steam
        </a>
      </section>
    </main>
  );
}
