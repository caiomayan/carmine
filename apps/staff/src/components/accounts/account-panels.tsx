'use client';

import type { StaffAccountDetail, StaffRole } from '@carmine/contracts';
import { gameModeSchema } from '@carmine/contracts/game-server';
import {
  accountAnonymizedSchema,
  type StaffRole as Role,
  staffAccountDetailSchema,
  staffCan,
  staffRoleSchema,
} from '@carmine/contracts/staff';
import { useId, useState } from 'react';
import { ActionForm } from '@/components/queue/action-form';
import { staffPost } from '@/lib/staff-request';
import type { StaffViewer } from '@/lib/staff-rules';

type Change = (detail: StaffAccountDetail) => void;

export const ROLE_LABEL: Record<Role | 'none', string> = {
  owner: 'Dono',
  admin: 'Admin',
  moderator: 'Moderador',
  none: 'Sem papel',
};

const MODE_LABEL = { retake: 'Retake', deathmatch: 'Deathmatch' } as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_OFFERED = 8;

/**
 * As últimas `count` segundas-feiras (`YYYY-MM-DD`), da atual para trás, no horário de Brasília (UTC−3, sem horário de
 * verão), como o Ranking as conta (a mesma conta de `recentWeekStarts` do site).
 */
export function recentWeekStarts(now: Date, count: number): string[] {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const mondayOffset = (local.getUTCDay() + 6) % 7;
  const monday =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    mondayOffset * DAY_MS;
  return Array.from({ length: count }, (_, i) =>
    new Date(monday - i * 7 * DAY_MS).toISOString().slice(0, 10),
  );
}

function Panel({
  id,
  title,
  children,
  testId,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="stp-card" aria-labelledby={id} data-testid={testId}>
      <h2 id={id} className="stp-card-h">
        {title}
      </h2>
      <div className="stp-panel-body">{children}</div>
    </section>
  );
}

export function VipPanel({
  detail,
  viewer,
  onChange,
}: {
  detail: StaffAccountDetail;
  viewer: StaffViewer;
  onChange: Change;
}) {
  const id = useId();
  const [days, setDays] = useState('30');
  // O formulário de revogar fica montado depois de revogar, para o aviso de feito não sumir com o VIP.
  const [offerRevoke, setOfferRevoke] = useState(detail.vip.active);
  if (detail.vip.active && !offerRevoke) setOfferRevoke(true);
  const base = `/api/staff/accounts/${detail.account.publicId}/vip` as const;

  if (!staffCan(viewer.role, 'vip.manage')) {
    return (
      <Panel id="vip" title="VIP">
        <p className="stp-muted">Só Admin e Dono mexem no VIP.</p>
      </Panel>
    );
  }
  const value = Number(days);
  return (
    <Panel id="vip" title="VIP" testId="vip-panel">
      <ActionForm
        label="Conceder dias"
        submitLabel="Conceder VIP"
        doneLabel="VIP concedido."
        testId="vip-grant"
        validate={() =>
          Number.isInteger(value) && value >= 1 && value <= 3650
            ? null
            : 'Informe de 1 a 3650 dias.'
        }
        onSubmit={(reason) =>
          staffPost(`${base}/grant`, { days: value, reason }, (json) =>
            staffAccountDetailSchema.parse(json),
          )
        }
        onSuccess={onChange}
      >
        <label className="stp-label" htmlFor={`${id}-days`}>
          Dias
        </label>
        <input
          id={`${id}-days`}
          className="stp-input stp-input-narrow"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          value={days}
          onChange={(event) => setDays(event.target.value)}
          data-testid="vip-days"
        />
        <p className="stp-muted">Soma ao Período VIP ativo.</p>
      </ActionForm>
      {offerRevoke ? (
        <ActionForm
          label="Revogar VIP"
          submitLabel="Revogar VIP agora"
          doneLabel="VIP revogado."
          testId="vip-revoke"
          onSubmit={(reason) =>
            staffPost(`${base}/revoke`, { reason }, (json) => staffAccountDetailSchema.parse(json))
          }
          onSuccess={onChange}
        />
      ) : null}
    </Panel>
  );
}

/**
 * Integridade do Ranking (S12): tira a Conta do Ranking de um Modo e semana, com motivo. As Estatísticas não mudam. A
 * semana é uma das últimas oito (as mais antigas, só pelo CLI).
 */
export function RankingPanel({
  detail,
  viewer,
  onChange,
}: {
  detail: StaffAccountDetail;
  viewer: StaffViewer;
  onChange: Change;
}) {
  const id = useId();
  const [mode, setMode] = useState<keyof typeof MODE_LABEL>('retake');
  const [weeks] = useState(() => recentWeekStarts(new Date(), WEEKS_OFFERED));
  const [week, setWeek] = useState(weeks[0] ?? '');
  if (!staffCan(viewer.role, 'ranking.remove')) return null;

  return (
    <Panel id="ranking" title="Ranking">
      <ActionForm
        label="Remover do Ranking"
        submitLabel="Remover do Ranking"
        doneLabel="Entrada removida do Ranking."
        testId="ranking-removal"
        description="Tira a Conta do Ranking de um Modo e semana. As Estatísticas e o Perfil não mudam. O jogador contesta pelo Discord; o motivo fica no log de auditoria. Semanas mais antigas, só pelo CLI (staff ranking-remove)."
        onSubmit={(reason) =>
          staffPost(
            `/api/staff/accounts/${detail.account.publicId}/ranking-removals`,
            { mode, weekStart: week, reason },
            (json) => staffAccountDetailSchema.parse(json),
          )
        }
        onSuccess={onChange}
      >
        <div className="stp-measure-field">
          <label className="stp-label" htmlFor={`${id}-mode`}>
            Modo
          </label>
          <select
            id={`${id}-mode`}
            className="stp-select"
            value={mode}
            onChange={(event) => setMode(gameModeSchema.parse(event.target.value))}
            data-testid="ranking-mode"
          >
            {gameModeSchema.options.map((value) => (
              <option key={value} value={value}>
                {MODE_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="stp-measure-field">
          <label className="stp-label" htmlFor={`${id}-week`}>
            Semana (segunda-feira)
          </label>
          <select
            id={`${id}-week`}
            className="stp-select"
            value={week}
            onChange={(event) => setWeek(event.target.value)}
            data-testid="ranking-week"
          >
            {weeks.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </ActionForm>
    </Panel>
  );
}

export function RolePanel({
  detail,
  viewer,
  onChange,
}: {
  detail: StaffAccountDetail;
  viewer: StaffViewer;
  onChange: Change;
}) {
  const id = useId();
  const { account } = detail;
  const [role, setRole] = useState<string>(account.staffRole ?? 'none');
  const current = ROLE_LABEL[account.staffRole ?? 'none'];

  if (!staffCan(viewer.role, 'roles.manage')) {
    return (
      <Panel id="papel" title="Papel na Staff">
        <p data-testid="role-readonly">Papel atual: {current}</p>
        <p className="stp-muted">Só o Dono altera papéis de Staff.</p>
      </Panel>
    );
  }
  return (
    <Panel id="papel" title="Papel na Staff">
      <p>Papel atual: {current}</p>
      {account.claimed ? (
        <ActionForm
          label="Alterar papel"
          submitLabel="Salvar papel"
          doneLabel="Papel atualizado."
          testId="role-form"
          onSubmit={(reason) => {
            const parsed = staffRoleSchema.safeParse(role);
            return staffPost(
              `/api/staff/accounts/${account.publicId}/role`,
              { role: parsed.success ? parsed.data : null, reason },
              (json) => staffAccountDetailSchema.parse(json),
              'PUT',
            );
          }}
          onSuccess={onChange}
        >
          <label className="stp-label" htmlFor={`${id}-role`}>
            Novo papel
          </label>
          <select
            id={`${id}-role`}
            className="stp-select"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            data-testid="role-select"
          >
            {(['none', 'moderator', 'admin', 'owner'] as (StaffRole | 'none')[]).map((value) => (
              <option key={value} value={value}>
                {ROLE_LABEL[value]}
              </option>
            ))}
          </select>
        </ActionForm>
      ) : (
        <p className="stp-muted">
          Só Contas reivindicadas (que já entraram no site) podem ter papel.
        </p>
      )}
    </Panel>
  );
}

/** Pedido de exclusão de dados (S08), só para o Dono: anonimiza a Conta, sem volta. A Conta da Staff sai da Staff antes. */
export function ErasurePanel({
  detail,
  viewer,
}: {
  detail: StaffAccountDetail;
  viewer: StaffViewer;
}) {
  const id = useId();
  const { account } = detail;
  const [erased, setErased] = useState(account.anonymized);
  const [understood, setUnderstood] = useState(false);

  if (erased) {
    return (
      <Panel id="exclusao" title="Exclusão de dados">
        <p data-testid="erasure-done">
          Conta anonimizada por um pedido de exclusão de dados. O SteamID64 fica só enquanto o ban
          valer.
        </p>
      </Panel>
    );
  }
  if (!staffCan(viewer.role, 'accounts.anonymize') || account.staffRole) {
    return (
      <Panel id="exclusao" title="Exclusão de dados">
        <p className="stp-muted">
          {account.staffRole
            ? 'Contas da Staff saem da Staff antes de serem anonimizadas.'
            : 'Só o Dono executa pedidos de exclusão de dados.'}
        </p>
      </Panel>
    );
  }
  return (
    <Panel id="exclusao" title="Exclusão de dados">
      <ActionForm
        label="Anonimizar a Conta"
        submitLabel="Anonimizar"
        doneLabel="Conta anonimizada. O Perfil público já não existe."
        testId="erasure-form"
        kind="danger"
        description="Para um pedido de exclusão que chegou pelo contato, depois de confirmar que a pessoa é dona da Conta. Apaga nome, avatar, Perfil público, Inventário, Presets e VIP e desfaz o vínculo com a Steam. Não tem volta. Ficam as punições e o log de auditoria; com um ban valendo, o SteamID64 fica até ele acabar."
        validate={() => (understood ? null : 'Marque que entende que não tem volta.')}
        onSubmit={(reason) =>
          staffPost(`/api/staff/accounts/${account.publicId}/anonymize`, { reason }, (json) =>
            accountAnonymizedSchema.parse(json),
          )
        }
        onSuccess={() => setErased(true)}
      >
        <label className="stp-check" htmlFor={`${id}-ok`}>
          <input
            id={`${id}-ok`}
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
            data-testid="erasure-understood"
          />
          <span>Entendo que anonimizar esta Conta não tem volta.</span>
        </label>
      </ActionForm>
    </Panel>
  );
}
