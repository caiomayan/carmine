'use client';

import { type StaffServer, staffServerSchema } from '@carmine/contracts/staff';
import { ArrowRightIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { ActionForm } from '@/components/queue/action-form';
import { normalizeServerCode, previewHostname } from '@/lib/servers';
import { staffPost } from '@/lib/staff-request';

const MODE_LABEL: Record<StaffServer['mode'], string> = {
  retake: 'Retake',
  deathmatch: 'Deathmatch',
};

/** Quanto o aviso "Salvo." fica antes de o formulário voltar ao botão (dá para editar de novo sem recarregar). */
const SAVED_MS = 2400;

/**
 * Um Servidor Carmine (S25): nome de vitrine e código, com o hostname do jogo ao vivo enquanto a Staff digita. O que
 * está no ar fica no topo do cartão; o formulário abre no lugar, pede o motivo (vai para a Auditoria) e o hostname muda
 * no jogo no próximo batimento (até 10 s).
 */
export function ServerCard({ initial }: { initial: StaffServer }) {
  const id = useId();
  const [server, setServer] = useState(initial);
  const [name, setName] = useState(initial.showcaseName ?? '');
  const [code, setCode] = useState(initial.code ?? '');
  const [round, setRound] = useState(0);
  const normalized = normalizeServerCode(code);
  const preview = previewHostname(name, normalized);
  const nameBad = name.trim().length > 0 && previewHostname(name, 'SP·1') === null;
  const codeBad = code.trim().length > 0 && previewHostname('Retake', normalized) === null;
  const reset = () => {
    setName(server.showcaseName ?? '');
    setCode(server.code ?? '');
  };

  return (
    <li className="stp-srv" data-testid="staff-server" data-server={server.name}>
      <div className="stp-srv-top">
        <span className="stp-dot">{MODE_LABEL[server.mode]}</span>
        {server.code ? <span className="stp-count-chip">{server.code}</span> : null}
      </div>
      <h2 className="stp-srv-name">{server.showcaseName ?? server.name}</h2>
      <p className="stp-cell-sub">
        {server.name} · {server.address}
      </p>
      <p className="stp-srv-host">
        <span className="stp-label">No jogo</span>
        <b
          key={server.hostname ?? 'pending'}
          data-testid="hostname-live"
          data-pending={server.hostname ? undefined : ''}
        >
          {server.hostname ?? 'Defina nome e código para o hostname mudar.'}
        </b>
        {preview && preview !== server.hostname ? (
          <span className="stp-srv-draft" data-testid="hostname-preview">
            <ArrowRightIcon size={13} aria-hidden="true" /> ficaria: {preview}
          </span>
        ) : null}
      </p>
      <ActionForm
        key={round}
        onCancel={reset}
        label="Editar"
        submitLabel="Salvar"
        doneLabel="Salvo. O hostname muda no jogo em até 10 s."
        testId="server-form"
        description="Nome de vitrine e código aparecem na Home, no botão Jogar e no hostname do jogo."
        validate={() => (preview ? null : 'Confira o nome de vitrine e o código.')}
        onSubmit={async (reason) => {
          const result = await staffPost(
            `/api/staff/servers/${server.id}`,
            { showcaseName: name.trim(), code: normalized, reason },
            (value) => staffServerSchema.parse(value),
            'PATCH',
          );
          if (result.ok) {
            setServer(result.data);
            setName(result.data.showcaseName ?? '');
            setCode(result.data.code ?? '');
            setTimeout(() => setRound((n) => n + 1), SAVED_MS);
          }
          return result;
        }}
      >
        <div className="stp-srv-fields">
          <div className="stp-measure-field">
            <label className="stp-label" htmlFor={`${id}-name`}>
              Nome de vitrine
            </label>
            <input
              id={`${id}-name`}
              className="stp-input"
              value={name}
              maxLength={40}
              aria-invalid={nameBad || undefined}
              onChange={(event) => setName(event.target.value)}
              data-testid="server-showcase-name"
            />
            <span className="stp-cell-sub">Descreve a variante, ex.: Retake · Rotação</span>
          </div>
          <div className="stp-measure-field">
            <label className="stp-label" htmlFor={`${id}-code`}>
              Código
            </label>
            <input
              id={`${id}-code`}
              className="stp-input"
              value={code}
              maxLength={8}
              autoCapitalize="characters"
              aria-invalid={codeBad || undefined}
              onChange={(event) => setCode(event.target.value)}
              onBlur={() => setCode((value) => normalizeServerCode(value))}
              data-testid="server-code-input"
            />
            <span className="stp-cell-sub">Região·número, ex.: SP·1</span>
          </div>
        </div>
      </ActionForm>
    </li>
  );
}
