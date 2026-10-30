import { SearchXIcon } from 'lucide-react';
import Link from 'next/link';

/** Uma tela ou uma Conta que não existe (ou que o papel não vê): a mesma resposta, sem revelar qual. */
export default function NotFound() {
  return (
    <div className="stp-page" data-testid="stp-not-found">
      <div className="stp-card">
        <div className="stp-empty">
          <SearchXIcon size={22} aria-hidden="true" />
          <b>Nada por aqui</b>
          <span>Esta tela ou esta Conta não existe, ou o seu papel não a vê.</span>
          <Link href="/" className="stp-btn" prefetch={false}>
            Voltar ao Início
          </Link>
        </div>
      </div>
    </div>
  );
}
