'use client';

import {
  ActivityIcon,
  CheckIcon,
  ClockIcon,
  CreditCardIcon,
  FlagIcon,
  ImageIcon,
  RadioIcon,
  ServerIcon,
  ShoppingBagIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  ALERTS,
  brl,
  type Deadline,
  deadlineOf,
  ONLINE_24H,
  type Photo,
  PURCHASES,
  type Report,
} from './data';
import { Eta } from './reports';

export type ViewId =
  | 'inicio'
  | 'denuncias'
  | 'fotos'
  | 'contas'
  | 'pagamentos'
  | 'servidores'
  | 'auditoria';

/** O menor prazo da fila, em uma frase curta. */
const soonLabel = (d: Deadline) =>
  d.leftMin < 0 ? d.label : `vence em ${d.label.replace(' restantes', '')}`;

export function Inicio({
  reports,
  photos,
  nowMs,
  go,
}: {
  reports: Report[];
  photos: Photo[];
  nowMs: number;
  go: (view: ViewId) => void;
}) {
  const pending = useMemo(() => {
    const items = [
      ...reports
        .filter((r) => r.status !== 'done')
        .map((r) => ({
          key: r.id,
          view: 'denuncias' as const,
          title: `${r.reported}`,
          sub: `${r.id} · ${r.server}`,
          deadline: deadlineOf(r.createdAt, nowMs),
        })),
      ...photos.map((p) => ({
        key: p.id,
        view: 'fotos' as const,
        title: p.account,
        sub: `${p.id} · foto de perfil`,
        deadline: deadlineOf(p.sentAt, nowMs),
      })),
    ];
    return items.sort((a, b) => a.deadline.leftMin - b.deadline.leftMin);
  }, [reports, photos, nowMs]);

  const reportsOpen = reports.filter((r) => r.status !== 'done');
  const soonestReport = reportsOpen
    .map((r) => deadlineOf(r.createdAt, nowMs))
    .sort((a, b) => a.leftMin - b.leftMin)[0];
  const soonestPhoto = photos
    .map((p) => deadlineOf(p.sentAt, nowMs))
    .sort((a, b) => a.leftMin - b.leftMin)[0];
  const peak = Math.max(...ONLINE_24H);

  return (
    <div className="stp-page" data-testid="stp-home">
      <div className="stp-head">
        <div>
          <h1>Início</h1>
          <p>O que pede a Staff agora. Dados de exemplo.</p>
        </div>
      </div>

      <div className="stp-stats">
        <div className="stp-stat">
          <span className="stp-stat-label">
            <ActivityIcon size={13} aria-hidden="true" /> Online agora
          </span>
          <span className="stp-stat-value">142</span>
          <span className="stp-stat-note">pico de hoje: {peak}</span>
        </div>
        <div className="stp-stat">
          <span className="stp-stat-label">
            <ServerIcon size={13} aria-hidden="true" /> Servidores no ar
          </span>
          <span className="stp-stat-value">
            5<small> de 6</small>
          </span>
          <span className="stp-stat-note" data-tone="danger">
            Retake #3 caído
          </span>
        </div>
        <button type="button" className="stp-stat" onClick={() => go('denuncias')}>
          <span className="stp-stat-label">
            <FlagIcon size={13} aria-hidden="true" /> Denúncias esperando
          </span>
          <span className="stp-stat-value">{reportsOpen.length}</span>
          {soonestReport ? (
            <span
              className="stp-stat-note"
              data-tone={soonestReport.tone === 'ok' ? undefined : soonestReport.tone}
            >
              {soonLabel(soonestReport)}
            </span>
          ) : null}
        </button>
        <button type="button" className="stp-stat" onClick={() => go('fotos')}>
          <span className="stp-stat-label">
            <ImageIcon size={13} aria-hidden="true" /> Fotos esperando
          </span>
          <span className="stp-stat-value">{photos.length}</span>
          {soonestPhoto ? (
            <span
              className="stp-stat-note"
              data-tone={soonestPhoto.tone === 'ok' ? undefined : soonestPhoto.tone}
            >
              {soonLabel(soonestPhoto)}
            </span>
          ) : (
            <span className="stp-stat-note">fila vazia</span>
          )}
        </button>
        <button type="button" className="stp-stat" onClick={() => go('pagamentos')}>
          <span className="stp-stat-label">
            <ShoppingBagIcon size={13} aria-hidden="true" /> Compras hoje
          </span>
          <span className="stp-stat-value">9</span>
          <span className="stp-stat-note">{brl(18710)} · 1 reembolso</span>
        </button>
        <div className="stp-stat" data-soon>
          <span className="stp-stat-label">
            <RadioIcon size={13} aria-hidden="true" /> Salas ao vivo
          </span>
          <span className="stp-stat-value">-</span>
          <span className="stp-stat-note">chega com as Salas (S23)</span>
        </div>
      </div>

      <div className="stp-split">
        <section className="stp-card" aria-labelledby="stp-wait">
          <div className="stp-card-head">
            <h2 id="stp-wait">Esperando revisão</h2>
            <small>prazo de 24 h</small>
          </div>
          <ul className="stp-list" data-testid="stp-pending">
            {pending.slice(0, 7).map((item) => (
              <li key={item.key}>
                <button type="button" className="stp-row" onClick={() => go(item.view)}>
                  <span
                    className="stp-ico"
                    data-tone={item.deadline.tone === 'ok' ? undefined : item.deadline.tone}
                  >
                    {item.view === 'denuncias' ? (
                      <FlagIcon size={14} aria-hidden="true" />
                    ) : (
                      <ImageIcon size={14} aria-hidden="true" />
                    )}
                  </span>
                  <span className="stp-row-main">
                    <span className="stp-row-title" style={{ display: 'block' }}>
                      {item.title}
                    </span>
                    <span className="stp-row-sub" style={{ display: 'block' }}>
                      {item.sub}
                    </span>
                  </span>
                  <Eta deadline={item.deadline} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="stp-col">
          <section className="stp-card" aria-labelledby="stp-alerts">
            <div className="stp-card-head">
              <h2 id="stp-alerts">Alertas</h2>
              <span className="stp-tag" data-tone="danger">
                {ALERTS.length}
              </span>
            </div>
            <ul className="stp-list">
              {ALERTS.map((alert) => (
                <li key={alert.id}>
                  <button type="button" className="stp-row" onClick={() => go('servidores')}>
                    <span className="stp-ico" data-tone={alert.severity}>
                      <TriangleAlertIcon size={14} aria-hidden="true" />
                    </span>
                    <span className="stp-row-main">
                      <span className="stp-row-title" style={{ display: 'block' }}>
                        {alert.title}
                      </span>
                      <span className="stp-row-sub" style={{ display: 'block' }}>
                        {alert.detail}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="stp-card" aria-labelledby="stp-online">
            <div className="stp-card-head">
              <h2 id="stp-online">Jogadores online</h2>
              <small>últimas 24 h</small>
            </div>
            <div
              className="stp-chart"
              role="img"
              aria-label={`Jogadores online por hora nas últimas 24 horas: de ${Math.min(...ONLINE_24H)} a ${peak}, agora 142.`}
            >
              {ONLINE_24H.map((value, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: série de 24 horas, a posição é a chave.
                <i key={index} style={{ height: `${Math.max(4, (value / peak) * 100)}%` }} />
              ))}
            </div>
            <div className="stp-chart-axis" aria-hidden="true">
              <span>-24 h</span>
              <span>-12 h</span>
              <span>agora</span>
            </div>
          </section>

          <section className="stp-card" aria-labelledby="stp-sales">
            <div className="stp-card-head">
              <h2 id="stp-sales">Compras de hoje</h2>
              <button type="button" className="stp-btn" onClick={() => go('pagamentos')}>
                Ver todas
              </button>
            </div>
            <ul className="stp-list">
              {PURCHASES.map((p) => (
                <li key={p.id} className="stp-purchase">
                  <span className="stp-row-main">
                    <span className="stp-row-title" style={{ display: 'block' }}>
                      {p.who}
                    </span>
                    <span className="stp-row-sub" style={{ display: 'block' }}>
                      {p.what} · {p.at}
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.state === 'refund' ? (
                      <span className="stp-tag" data-tone="warn">
                        Reembolso
                      </span>
                    ) : null}
                    <span className="num">{brl(p.value)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export function Photos({
  photos,
  nowMs,
  onDecide,
}: {
  photos: Photo[];
  nowMs: number;
  onDecide: (photo: Photo, approved: boolean) => void;
}) {
  const ordered = [...photos].sort((a, b) => a.sentAt - b.sentAt);
  return (
    <div className="stp-page" data-testid="stp-photos">
      <div className="stp-head">
        <div>
          <h1>Fotos de perfil</h1>
          <p>
            {photos.length
              ? `${photos.length} esperando revisão, as mais antigas primeiro.`
              : 'Nenhuma foto esperando revisão.'}
          </p>
        </div>
      </div>
      {photos.length === 0 ? (
        <div className="stp-card">
          <div className="stp-empty" data-testid="stp-photos-empty">
            <ClockIcon size={20} aria-hidden="true" />
            <b>Fila de fotos em dia</b>
            <span>As fotos novas aparecem aqui, com 24 h de prazo cada.</span>
          </div>
        </div>
      ) : (
        <div className="stp-photos">
          {ordered.map((photo) => {
            const deadline = deadlineOf(photo.sentAt, nowMs);
            return (
              <article className="stp-card stp-photo" key={photo.id} data-testid="stp-photo">
                <div
                  className="stp-photo-art"
                  aria-hidden="true"
                  style={{
                    background: `linear-gradient(135deg, oklch(0.55 0.13 ${photo.hue}), oklch(0.38 0.1 ${(photo.hue + 40) % 360}))`,
                  }}
                >
                  {photo.account.slice(0, 1).toUpperCase()}
                </div>
                <div className="stp-photo-meta">
                  <span className="stp-row-main">
                    <span className="stp-row-title" style={{ display: 'block' }}>
                      {photo.account}
                    </span>
                    <span className="stp-row-sub stp-mono" style={{ display: 'block' }}>
                      {photo.id}
                    </span>
                  </span>
                  <Eta deadline={deadline} />
                </div>
                <div className="stp-photo-actions">
                  <button
                    type="button"
                    className="stp-btn"
                    data-kind="danger"
                    onClick={() => onDecide(photo, false)}
                  >
                    <XIcon size={14} aria-hidden="true" /> Recusar
                  </button>
                  <button
                    type="button"
                    className="stp-btn"
                    data-kind="primary"
                    onClick={() => onDecide(photo, true)}
                  >
                    <CheckIcon size={14} aria-hidden="true" /> Aprovar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STUBS: Record<
  'contas' | 'pagamentos' | 'servidores' | 'auditoria',
  { title: string; icon: typeof CreditCardIcon; text: string }
> = {
  contas: {
    title: 'Contas',
    icon: ActivityIcon,
    text: 'A ficha da Conta, o histórico de Punições e a marcação de criador de conteúdo.',
  },
  pagamentos: {
    title: 'Pagamentos',
    icon: CreditCardIcon,
    text: 'Compras, reembolsos e a conferência do dia.',
  },
  servidores: {
    title: 'Servidores',
    icon: ServerIcon,
    text: 'Estado dos servidores, batimento e a edição do que cada um mostra.',
  },
  auditoria: {
    title: 'Auditoria',
    icon: ClockIcon,
    text: 'Quem fez o quê no painel, com filtro por pessoa e por ação.',
  },
};

export function Stub({ view }: { view: keyof typeof STUBS }) {
  const stub = STUBS[view];
  const Icon = stub.icon;
  return (
    <div className="stp-page">
      <div className="stp-head">
        <div>
          <h1>{stub.title}</h1>
        </div>
      </div>
      <div className="stp-card">
        <div className="stp-empty">
          <Icon size={20} aria-hidden="true" />
          <b>Esta tela migra depois da direção aprovada</b>
          <span>{stub.text}</span>
        </div>
      </div>
    </div>
  );
}
