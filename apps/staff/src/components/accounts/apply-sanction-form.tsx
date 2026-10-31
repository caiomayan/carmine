'use client';

import type {
  SanctionCategory,
  SanctionMeasure,
  SanctionType,
  StaffAccountDetail,
} from '@carmine/contracts';
import {
  RECIDIVISM_WINDOW_DAYS,
  requiresCheatProof,
  SANCTION_MAX_DURATION_MINUTES,
  sanctionCategorySchema,
  sanctionEvidenceUrlSchema,
} from '@carmine/contracts/moderation';
import { isLastingSanction } from '@carmine/contracts/rules';
import { staffAccountDetailSchema } from '@carmine/contracts/staff';
import { CheckIcon, PlusIcon, XIcon } from 'lucide-react';
import { type FormEvent, useId, useRef, useState } from 'react';
import { REASON_MAX, REASON_MIN } from '@/components/queue/action-form';
import {
  categoryLabel,
  type DurationUnit,
  durationParts,
  measureLabel,
  PUBLIC_CATEGORY_LABEL,
  SANCTION_TYPE_HINT,
  SANCTION_TYPE_LABEL,
  sameMeasures,
  toMinutes,
  UNIT_LABEL,
} from '@/lib/moderation';
import { staffPost } from '@/lib/staff-request';
import { measureOptions, type StaffViewer } from '@/lib/staff-rules';

/** A Denúncia (S13) de onde a Staff veio: a Punição a fecha; cheat e voz exigem evidência. */
export type ReportOrigin = { id: string; needsEvidence: boolean };

type Draft = { type: SanctionType; value: string; unit: DurationUnit; permanent: boolean };

const UNITS: DurationUnit[] = ['minute', 'hour', 'day'];

function toDraft(measure: SanctionMeasure): Draft {
  const parts = durationParts(measure.durationMinutes);
  return parts.unit === 'permanent'
    ? { type: measure.type, value: '1', unit: 'day', permanent: isLastingSanction(measure.type) }
    : { type: measure.type, value: String(parts.value), unit: parts.unit, permanent: false };
}

/** A medida do rascunho; nulo se a duração não é um número válido. */
function toMeasure(draft: Draft): SanctionMeasure | null {
  if (!isLastingSanction(draft.type)) return { type: draft.type, durationMinutes: null };
  if (draft.permanent) return { type: draft.type, durationMinutes: null };
  const value = Number(draft.value);
  if (!Number.isInteger(value) || value < 1) return null;
  const minutes = toMinutes(value, draft.unit);
  return minutes > SANCTION_MAX_DURATION_MINUTES
    ? null
    : { type: draft.type, durationMinutes: minutes };
}

/**
 * Aplicar Punição: a Staff escolhe a Categoria, o painel mostra a reincidência na janela de 30 dias e preenche as medidas
 * com a sugestão da tabela; a Staff confirma ou ajusta, escreve o motivo e revisa antes de aplicar. Sem modal: a revisão
 * abre no próprio formulário. Vindo de uma Denúncia, a Punição a fecha como punida (o caso inteiro).
 */
export function ApplySanctionForm({
  detail,
  viewer,
  onApplied,
  report: reportProp,
}: {
  detail: StaffAccountDetail;
  viewer: StaffViewer;
  onApplied: (detail: StaffAccountDetail) => void;
  report?: ReportOrigin;
}) {
  const id = useId();
  const options = measureOptions(viewer.role);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [category, setCategory] = useState<SanctionCategory | ''>('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reason, setReason] = useState('');
  const [witness, setWitness] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [proofError, setProofError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  // A Denúncia é fechada pela primeira Punição; as seguintes na mesma visita já não carregam o caso.
  const [reportClosed, setReportClosed] = useState(false);
  const report = reportClosed ? undefined : reportProp;

  const suggestion = category ? detail.suggestions.find((s) => s.category === category) : undefined;
  const measures = drafts.map(toMeasure);
  const valid = measures.every((m): m is SanctionMeasure => m !== null);
  const chosen = valid ? (measures as SanctionMeasure[]) : [];
  const follows = suggestion && valid ? sameMeasures(chosen, suggestion.measures) : false;
  const blockedPermanent =
    !options.permanent && drafts.some((d) => isLastingSanction(d.type) && d.permanent);
  const duplicateType = new Set(drafts.map((d) => d.type)).size !== drafts.length;
  // Ban por cheat: testemunha e/ou link da evidência (decisão do dono, 2026-10-13).
  const needsProof =
    category !== '' && (requiresCheatProof(category, chosen) || report?.needsEvidence === true);
  const proof = needsProof
    ? {
        ...(witness.trim() && { witness: witness.trim() }),
        ...(evidenceUrl.trim() && { evidenceUrl: evidenceUrl.trim() }),
      }
    : {};

  const pickCategory = (value: string) => {
    const next = sanctionCategorySchema.safeParse(value);
    setReviewing(false);
    setDone(false);
    setError(null);
    if (!next.success) {
      setCategory('');
      setDrafts([]);
      return;
    }
    setCategory(next.data);
    const s = detail.suggestions.find((x) => x.category === next.data);
    setDrafts((s?.measures ?? [{ type: 'warning', durationMinutes: null }]).map(toDraft));
  };

  const update = (index: number, patch: Partial<Draft>) => {
    setReviewing(false);
    setDrafts((current) => current.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const review = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (!category || !valid || blockedPermanent || duplicateType) return;
    if (reason.trim().length < REASON_MIN) {
      setReasonError(`Escreva o motivo (pelo menos ${REASON_MIN} caracteres).`);
      document.getElementById(`${id}-reason`)?.focus();
      return;
    }
    setReasonError(null);
    if (needsProof) {
      const evidence = evidenceUrl.trim();
      const problem =
        !witness.trim() && !evidence
          ? 'Informe a testemunha ou o link da evidência.'
          : evidence && !sanctionEvidenceUrlSchema.safeParse(evidence).success
            ? 'Use um link que comece com http:// ou https://.'
            : witness.trim() && witness.trim().length < 2
              ? 'Informe a testemunha ou o link da evidência.'
              : null;
      setProofError(problem);
      if (problem) {
        document.getElementById(`${id}-witness`)?.focus();
        return;
      }
    }
    setReviewing(true);
    requestAnimationFrame(() => confirmRef.current?.focus());
  };

  const apply = async () => {
    if (!category) return;
    setPending(true);
    const result = await staffPost(
      `/api/staff/accounts/${detail.account.publicId}/sanctions`,
      {
        category,
        reason: reason.trim(),
        measures: chosen,
        ...proof,
        ...(report && { reportId: report.id }),
      },
      (value) => staffAccountDetailSchema.parse(value),
    );
    setPending(false);
    if (!result.ok) {
      setReviewing(false);
      setError(result.message);
      return;
    }
    onApplied(result.data);
    setCategory('');
    setDrafts([]);
    setReason('');
    setWitness('');
    setEvidenceUrl('');
    setReviewing(false);
    setDone(true);
    if (report) setReportClosed(true);
  };

  const offenses = (c: SanctionCategory) =>
    detail.suggestions.find((s) => s.category === c)?.previousOffenses ?? 0;

  return (
    <form onSubmit={review} noValidate className="stp-apply" data-testid="apply-sanction">
      {report ? (
        <p className="stp-quote" data-testid="apply-from-report">
          {report.needsEvidence
            ? 'Esta Punição vem de uma Denúncia de cheat ou de voz. Sem demo, a Denúncia sozinha não basta: informe a testemunha ou o link da evidência (por exemplo, um clipe enviado no Discord).'
            : 'Esta Punição vem de uma Denúncia da fila: ao aplicar, o caso é fechado como punido (todas as Denúncias dele).'}
        </p>
      ) : null}

      <label className="stp-label" htmlFor={`${id}-category`}>
        Categoria da infração
      </label>
      <select
        id={`${id}-category`}
        className="stp-select"
        value={category}
        onChange={(event) => pickCategory(event.target.value)}
        data-testid="sanction-category"
      >
        <option value="">Escolha a categoria</option>
        {sanctionCategorySchema.options.map((c) => (
          <option key={c} value={c}>
            {categoryLabel(c)}
            {offenses(c) > 0
              ? ` · ${offenses(c) === 1 ? '1 ocorrência' : `${offenses(c)} ocorrências`} em ${RECIDIVISM_WINDOW_DAYS} dias`
              : ''}
          </option>
        ))}
      </select>

      {category ? (
        <div className="stp-apply-body" data-testid="apply-body">
          {suggestion ? (
            <div
              className="stp-suggestion"
              data-testid="sanction-suggestion"
              data-offense={suggestion.offense}
            >
              <span className="stp-muted">
                {suggestion.offense}ª ocorrência em {RECIDIVISM_WINDOW_DAYS} dias. A tabela sugere:
              </span>
              <b data-testid="suggested-measures">
                {suggestion.measures.map(measureLabel).join(' + ')}
              </b>
            </div>
          ) : null}

          <fieldset className="stp-fieldset">
            <legend className="stp-legend">
              <span>Medidas</span>
              {valid && suggestion ? (
                <span
                  className="stp-dot"
                  data-tone={follows ? 'ok' : 'warn'}
                  data-testid="suggestion-state"
                  data-follows={follows}
                >
                  {follows ? 'Segue a tabela' : 'Ajustado pela Staff'}
                </span>
              ) : null}
            </legend>
            {drafts.map((draft, index) => (
              <MeasureRow
                // biome-ignore lint/suspicious/noArrayIndexKey: as medidas não têm id; no máximo 2, na ordem.
                key={index}
                id={`${id}-m${index}`}
                draft={draft}
                allowPermanent={options.permanent}
                types={options.types}
                onChange={(patch) => update(index, patch)}
                onRemove={
                  drafts.length > 1
                    ? () => setDrafts((current) => current.filter((_, i) => i !== index))
                    : undefined
                }
              />
            ))}
            <div className="stp-inline">
              {drafts.length < 2 ? (
                <button
                  type="button"
                  className="stp-btn"
                  onClick={() =>
                    setDrafts((current) => [
                      ...current,
                      { type: 'ban', value: '1', unit: 'day', permanent: false },
                    ])
                  }
                >
                  <PlusIcon size={14} aria-hidden="true" /> Adicionar medida
                </button>
              ) : null}
              {suggestion && valid && !follows ? (
                <button
                  type="button"
                  className="stp-btn"
                  onClick={() => pickCategory(suggestion.category)}
                >
                  Voltar à sugestão
                </button>
              ) : null}
            </div>
            {blockedPermanent ? (
              <p className="stp-field-error">Só Admin e Dono aplicam punição permanente.</p>
            ) : null}
            {duplicateType ? (
              <p className="stp-field-error">
                Cada tipo vale uma vez por ocorrência: tire a medida repetida.
              </p>
            ) : null}
          </fieldset>

          {needsProof ? (
            <fieldset className="stp-fieldset" data-testid="cheat-proof">
              <legend className="stp-legend">
                <span>Prova do cheat</span>
              </legend>
              <p className="stp-muted">
                Ban por cheat exige uma testemunha, o link da evidência ou os dois. Só com a
                evidência o Perfil público mostra “Cheat”; só com testemunha, mostra “Violação das
                regras”.
              </p>
              <label className="stp-label" htmlFor={`${id}-witness`}>
                Testemunha
              </label>
              <input
                id={`${id}-witness`}
                className="stp-input"
                value={witness}
                maxLength={200}
                placeholder="Nome, ID público ou Discord"
                aria-invalid={proofError ? true : undefined}
                onChange={(event) => {
                  setWitness(event.target.value);
                  setReviewing(false);
                  setProofError(null);
                }}
                data-testid="proof-witness"
              />
              <label className="stp-label" htmlFor={`${id}-evidence`}>
                Link da evidência
              </label>
              <input
                id={`${id}-evidence`}
                className="stp-input"
                type="url"
                inputMode="url"
                value={evidenceUrl}
                maxLength={500}
                placeholder="https://"
                aria-invalid={proofError ? true : undefined}
                onChange={(event) => {
                  setEvidenceUrl(event.target.value);
                  setReviewing(false);
                  setProofError(null);
                }}
                data-testid="proof-evidence"
              />
              {proofError ? <p className="stp-field-error">{proofError}</p> : null}
            </fieldset>
          ) : null}

          <label className="stp-label" htmlFor={`${id}-reason`}>
            Motivo (interno da Staff: vai para o log de auditoria e nunca aparece no Perfil)
            <span className="stp-label-count">
              {reason.length}/{REASON_MAX}
            </span>
          </label>
          <textarea
            id={`${id}-reason`}
            className="stp-textarea"
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            placeholder="O que aconteceu, onde e a evidência (clipe, print, log do chat)"
            aria-invalid={reasonError ? true : undefined}
            onChange={(event) => {
              setReason(event.target.value);
              setReviewing(false);
              if (reasonError && event.target.value.trim().length >= REASON_MIN)
                setReasonError(null);
            }}
            data-testid="sanction-reason-input"
          />
          {reasonError ? <p className="stp-field-error">{reasonError}</p> : null}

          {reviewing ? (
            <fieldset className="stp-confirm" data-testid="sanction-confirm">
              <legend className="stp-confirm-title">Confirme a punição</legend>
              <p>
                {detail.account.displayName} recebe: {chosen.map(measureLabel).join(' + ')}.
                Categoria: {PUBLIC_CATEGORY_LABEL[category] ?? categoryLabel(category)}.
              </p>
              {needsProof ? (
                <p className="stp-muted" data-testid="proof-public">
                  {proof.evidenceUrl
                    ? 'No Perfil público, aparece como “Cheat” (há evidência anexada).'
                    : 'No Perfil público, aparece como “Violação das regras” (sem evidência anexada).'}
                </p>
              ) : null}
              {chosen.some((m) => m.type === 'ban') ? (
                <p className="stp-muted">
                  O ban derruba o jogador do servidor em até 15 s e encerra as sessões dele no site.
                </p>
              ) : null}
              <div className="stp-form-actions">
                <button type="button" className="stp-btn" onClick={() => setReviewing(false)}>
                  Voltar
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  className="stp-btn"
                  data-kind="primary"
                  disabled={pending}
                  aria-busy={pending || undefined}
                  onClick={apply}
                  data-testid="sanction-apply"
                >
                  Confirmar e aplicar
                </button>
              </div>
            </fieldset>
          ) : (
            <div className="stp-form-actions">
              <button
                type="submit"
                className="stp-btn"
                data-kind="primary"
                disabled={!valid || blockedPermanent || duplicateType}
                data-testid="sanction-review"
              >
                Revisar e aplicar
              </button>
            </div>
          )}
        </div>
      ) : null}

      {done ? (
        <p className="stp-done" role="status" data-testid="apply-done">
          <CheckIcon size={15} aria-hidden="true" /> Punição aplicada.
        </p>
      ) : null}
      {error ? (
        <p className="stp-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function MeasureRow({
  id,
  draft,
  types,
  allowPermanent,
  onChange,
  onRemove,
}: {
  id: string;
  draft: Draft;
  types: SanctionType[];
  allowPermanent: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove?: () => void;
}) {
  const lasting = isLastingSanction(draft.type);
  const invalidValue = lasting && !draft.permanent && toMeasure(draft) === null;

  return (
    <div className="stp-measure" data-testid="measure-row">
      <div className="stp-measure-field">
        <label className="stp-label" htmlFor={`${id}-type`}>
          Tipo
        </label>
        <select
          id={`${id}-type`}
          className="stp-select"
          value={draft.type}
          onChange={(event) => onChange({ type: event.target.value as SanctionType })}
          data-testid="measure-type"
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {SANCTION_TYPE_LABEL[type]} — {SANCTION_TYPE_HINT[type]}
            </option>
          ))}
        </select>
      </div>
      {lasting ? (
        <>
          <div className="stp-measure-field">
            <label className="stp-label" htmlFor={`${id}-value`}>
              Quantidade
            </label>
            <input
              id={`${id}-value`}
              className="stp-input"
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.value}
              disabled={draft.permanent}
              aria-invalid={invalidValue || undefined}
              onChange={(event) => onChange({ value: event.target.value })}
              data-testid="measure-value"
            />
          </div>
          <div className="stp-measure-field">
            <label className="stp-label" htmlFor={`${id}-unit`}>
              Unidade
            </label>
            <select
              id={`${id}-unit`}
              className="stp-select"
              value={draft.unit}
              disabled={draft.permanent}
              onChange={(event) => onChange({ unit: event.target.value as DurationUnit })}
              data-testid="measure-unit"
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABEL[unit]}
                </option>
              ))}
            </select>
          </div>
          <label
            className="stp-check"
            data-disabled={!allowPermanent && !draft.permanent ? '' : undefined}
          >
            <input
              type="checkbox"
              checked={draft.permanent}
              disabled={!allowPermanent && !draft.permanent}
              onChange={(event) => onChange({ permanent: event.target.checked })}
              data-testid="measure-permanent"
            />
            Permanente
          </label>
        </>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          className="stp-round"
          aria-label="Tirar esta medida"
          onClick={onRemove}
        >
          <XIcon size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
