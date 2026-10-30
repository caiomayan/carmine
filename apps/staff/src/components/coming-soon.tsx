import { ClockIcon } from 'lucide-react';

/**
 * As telas que ainda migram do site (S25 PR B em PRs seguintes, uma ou duas por vez): o painel já tem o endereço e o
 * lugar no trilho, e a tela diz que ainda não chegou, sem inventar conteúdo.
 */
export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <div className="stp-page" data-testid="stp-coming">
      <div className="stp-head">
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="stp-card">
        <div className="stp-empty">
          <ClockIcon size={22} aria-hidden="true" />
          <b>Esta tela ainda está no site</b>
          <span>{text}</span>
        </div>
      </div>
    </div>
  );
}
