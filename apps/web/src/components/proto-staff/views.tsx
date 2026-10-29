'use client';

import {
  ActivityIcon,
  ArrowUpRightIcon,
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
import type { ArtPair } from '@/components/vida/map-art';
import { MapPicture } from '@/components/vida/map-picture';
import { HairChart, Sparkline } from './charts';
import {
  ALERTS,
  brl,
  type Deadline,
  deadlineOf,
  greeting,
  MODES,
  type ModeId,
  onlineFor,
  type Photo,
  PURCHASES,
  type Report,
  SERVER_LIST,
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

const DATE = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** Uma frase curta com o menor prazo da fila. */
const soonLabel = (d: Deadline) =>
  d.leftMin < 0 ? d.label : `vence em ${d.label.replace(' restantes', '')}`;

/** O valor com a parte decimal apagada: R$ 187,10 vira "R$ 187" + ",10" apagado. */
function Money({ cents }: { cents: number }) {
  const [whole, fraction] = brl(cents).split(',');
  return (
    <>
      {whole}
      <small>,{fraction}</small>
    </>
  );
}

/** O botão redondo ↗ de cada cartão: leva à tela do assunto. */
function Arrow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="stp-arrow" aria-label={label} onClick={onClick}>
      <ArrowUpRightIcon size={16} aria-hidden="true" />
    </button>
  );
}

/** Quanto do prazo de 24 h ainda resta (0 a 1): a barra esvazia com o tempo. */
const remaining = (d: Deadline) => Math.max(0.03, Math.min(1, d.leftMin / 1440));

export function Inicio({
  reports,
  photos,
  nowMs,
  go,
  mode,
  onMode,
  heroMap,
  heroArt,
}: {
  reports: Report[];
  photos: Photo[];
  nowMs: number;
  go: (view: ViewId) => void;
  mode: ModeId;
  onMode: (mode: ModeId) => void;
  heroMap: string | null;
  heroArt: ArtPair | null;
}) {
  const pending = useMemo(() => {
    const items = [
      ...reports
        .filter((r) => r.status !== 'done')
        .map((r) => ({
          key: r.id,
          view: 'denuncias' as const,
          title: r.reported,
          sub: `${r.id} · ${r.server}`,
          deadline: deadlineOf(r.createdAt, nowMs),
        })),
      ...photos.map((p) => ({
        key: p.id,
        view: 'fotos' as const,
        title: p.account,
        sub: `${p.id} · foto denunciada`,
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
  // Passou de 20 h (menos de 4 h de prazo): o cartão vira destaque cheio.
  const hot = (d: Deadline | undefined) => (d && d.leftMin < 240 ? '' : undefined);

  const online = onlineFor(mode);
  const servers = SERVER_LIST.filter((s) => mode === 'all' || s.mode === mode);
  const up = servers.filter((s) => s.up).length;

  return (
    <div className="stp-page" data-testid="stp-home">
      <section className="stp-hero" aria-labelledby="stp-hello">
        {heroMap && heroArt ? (
          <div className="stp-hero-art" aria-hidden="true">
            <MapPicture map={heroMap} art={heroArt} sizes="100vw" />
          </div>
        ) : null}
        <div className="stp-hero-row">
          <div>
            <h1 id="stp-hello">
              {greeting(nowMs)}, <em>Mara</em>
            </h1>
            <p>
              {DATE.format(nowMs)} · {reportsOpen.length + photos.length} itens esperando revisão
            </p>
          </div>
        </div>
        <fieldset className="stp-modes">
          <legend className="stp-sr">Filtrar por Modo</legend>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="stp-mode"
              aria-pressed={mode === m.id}
              onClick={() => onMode(m.id)}
              data-testid={`stp-mode-${m.id}`}
            >
              {m.label}
            </button>
          ))}
        </fieldset>
      </section>

      <div className="stp-grid">
        <section className="stp-card" aria-labelledby="stp-c-online">
          <div className="stp-card-top">
            <div className="stp-card-title">
              <span className="stp-card-ico">
                <ActivityIcon size={16} aria-hidden="true" />
              </span>
              <h2 id="stp-c-online">Jogadores online</h2>
            </div>
            <Arrow label="Abrir Servidores" onClick={() => go('servidores')} />
          </div>
          {online ? (
            <>
              <div className="stp-big" data-testid="stp-online">
                {online.now}
              </div>
              <Sparkline
                values={online.series}
                label={`Jogadores online nas últimas 24 horas, agora ${online.now}.`}
              />
            </>
          ) : (
            <>
              <div className="stp-big">-</div>
              <div className="stp-card-sub">As Salas chegam com a S23.</div>
            </>
          )}
        </section>

        <section className="stp-card" aria-labelledby="stp-c-servers">
          <div className="stp-card-top">
            <div className="stp-card-title">
              <span className="stp-card-ico">
                <ServerIcon size={16} aria-hidden="true" />
              </span>
              <h2 id="stp-c-servers">Servidores no ar</h2>
            </div>
            <Arrow label="Abrir Servidores" onClick={() => go('servidores')} />
          </div>
          <div className="stp-big">
            {mode === 'rooms' ? '-' : up}
            {mode === 'rooms' ? null : <small> de {servers.length}</small>}
          </div>
          <ul className="stp-servers" aria-label="Estado de cada servidor">
            {servers.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <span className="stp-dot" data-tone={s.up ? 'ok' : 'danger'}>
                  <span className="stp-sr">{s.up ? 'no ar' : 'caído'}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="stp-card"
          aria-labelledby="stp-c-reports"
          data-hl={hot(soonestReport)}
          data-testid="stp-card-reports"
        >
          <div className="stp-card-top">
            <div className="stp-card-title">
              <span className="stp-card-ico">
                <FlagIcon size={16} aria-hidden="true" />
              </span>
              <h2 id="stp-c-reports">Denúncias esperando</h2>
            </div>
            <Arrow label="Abrir Denúncias" onClick={() => go('denuncias')} />
          </div>
          <div className="stp-big">{reportsOpen.length}</div>
          {soonestReport ? (
            <>
              <span
                className="stp-meter"
                data-tone={soonestReport.tone === 'ok' ? undefined : soonestReport.tone}
                aria-hidden="true"
              >
                <i style={{ width: `${Math.round(remaining(soonestReport) * 100)}%` }} />
              </span>
              <div className="stp-card-sub">{soonLabel(soonestReport)}</div>
            </>
          ) : null}
        </section>

        <section
          className="stp-card"
          aria-labelledby="stp-c-photos"
          data-hl={hot(soonestPhoto)}
          data-testid="stp-card-photos"
        >
          <div className="stp-card-top">
            <div className="stp-card-title">
              <span className="stp-card-ico">
                <ImageIcon size={16} aria-hidden="true" />
              </span>
              <h2 id="stp-c-photos">Fotos denunciadas</h2>
            </div>
            <Arrow label="Abrir Fotos" onClick={() => go('fotos')} />
          </div>
          <div className="stp-big">{photos.length}</div>
          {soonestPhoto ? (
            <>
              <span
                className="stp-meter"
                data-tone={soonestPhoto.tone === 'ok' ? undefined : soonestPhoto.tone}
                aria-hidden="true"
              >
                <i style={{ width: `${Math.round(remaining(soonestPhoto) * 100)}%` }} />
              </span>
              <div className="stp-card-sub">{soonLabel(soonestPhoto)}</div>
            </>
          ) : (
            <div className="stp-card-sub">fila vazia</div>
          )}
        </section>
      </div>

      <div className="stp-split">
        <section className="stp-card" aria-labelledby="stp-c-chart">
          <div className="stp-card-top">
            <div className="stp-card-title">
              <span className="stp-card-ico">
                <ActivityIcon size={16} aria-hidden="true" />
              </span>
              <h2 id="stp-c-chart">Jogadores online por hora</h2>
            </div>
          </div>
          {online ? (
            <>
              <HairChart
                values={online.series}
                label={`Jogadores online por hora nas últimas 24 horas: de ${Math.min(...online.series)} a ${Math.max(...online.series)}, agora ${online.now}.`}
              />
              <div className="stp-axis" aria-hidden="true">
                <span>-24 h</span>
                <span>-12 h</span>
                <span>agora</span>
              </div>
            </>
          ) : (
            <div className="stp-empty">
              <b>As Salas ainda não existem</b>
              <span>O gráfico delas aparece quando a S23 chegar.</span>
            </div>
          )}
        </section>

        <section className="stp-card" aria-labelledby="stp-c-sales">
          <div className="stp-card-top">
            <div className="stp-card-title">
              <span className="stp-card-ico">
                <ShoppingBagIcon size={16} aria-hidden="true" />
              </span>
              <h2 id="stp-c-sales">Compras hoje</h2>
            </div>
            <Arrow label="Abrir Pagamentos" onClick={() => go('pagamentos')} />
          </div>
          <div className="stp-big" data-testid="stp-sales">
            <Money cents={18710} />
          </div>
          <div className="stp-card-sub">9 compras · 1 reembolso de {brl(4990)}</div>
          <ul className="stp-list">
            {PURCHASES.slice(0, 3).map((p) => (
              <li key={p.id} className="stp-purchase">
                <span>
                  <span className="stp-row-title">{p.who}</span>
                  <span className="stp-row-sub">
                    {p.what} · {p.at}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {p.state === 'refund' ? (
                    <span className="stp-dot" data-tone="warn">
                      Reembolso
                    </span>
                  ) : null}
                  <b>{brl(p.value)}</b>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="stp-split">
        <section className="stp-card" aria-labelledby="stp-wait">
          <div className="stp-card-top">
            <div className="stp-card-title">
              <span className="stp-card-ico">
                <ClockIcon size={16} aria-hidden="true" />
              </span>
              <h2 id="stp-wait">Esperando revisão</h2>
            </div>
            <span className="stp-card-sub" style={{ margin: 0 }}>
              prazo de 24 h
            </span>
          </div>
          <ul className="stp-list" data-testid="stp-pending">
            {pending.slice(0, 6).map((item) => (
              <li key={item.key}>
                <button type="button" className="stp-row" onClick={() => go(item.view)}>
                  <span className="stp-ini" aria-hidden="true">
                    {item.title.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <span className="stp-row-title">{item.title}</span>
                    <span className="stp-row-sub">{item.sub}</span>
                  </span>
                  <Eta deadline={item.deadline} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="stp-col">
          <section className="stp-card" aria-labelledby="stp-c-alerts">
            <div className="stp-card-top">
              <div className="stp-card-title">
                <span className="stp-card-ico">
                  <TriangleAlertIcon size={16} aria-hidden="true" />
                </span>
                <h2 id="stp-c-alerts">Alertas</h2>
              </div>
              <Arrow label="Abrir Servidores" onClick={() => go('servidores')} />
            </div>
            <ul className="stp-list">
              {ALERTS.map((alert) => (
                <li key={alert.id} className="stp-purchase">
                  <span>
                    <span className="stp-row-title">{alert.title}</span>
                    <span className="stp-row-sub">{alert.detail}</span>
                  </span>
                  <span className="stp-dot" data-tone={alert.severity}>
                    <span className="stp-sr">
                      {alert.severity === 'danger' ? 'urgente' : 'atenção'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="stp-card" data-soon aria-labelledby="stp-c-rooms">
            <div className="stp-card-top">
              <div className="stp-card-title">
                <span className="stp-card-ico">
                  <RadioIcon size={16} aria-hidden="true" />
                </span>
                <h2 id="stp-c-rooms">Salas ao vivo</h2>
              </div>
            </div>
            <div className="stp-card-sub">Chega com as Salas (S23).</div>
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
          <h1>Fotos denunciadas</h1>
          <p>
            {photos.length
              ? `${photos.length} esperando decisão, as mais antigas primeiro. A foto denunciada por 2 Contas sai do ar até a Staff decidir.`
              : 'Nenhuma foto denunciada esperando decisão.'}
          </p>
        </div>
      </div>
      {photos.length === 0 ? (
        <div className="stp-card">
          <div className="stp-empty" data-testid="stp-photos-empty">
            <ClockIcon size={22} aria-hidden="true" />
            <b>Fila de fotos em dia</b>
            <span>As fotos denunciadas aparecem aqui, com até 24 h de prazo cada.</span>
          </div>
        </div>
      ) : (
        <div className="stp-photos">
          {ordered.map((photo) => {
            const deadline = deadlineOf(photo.sentAt, nowMs);
            return (
              <article className="stp-card stp-photo" key={photo.id} data-testid="stp-photo">
                <div className="stp-photo-art" aria-hidden="true">
                  {photo.account.slice(0, 1).toUpperCase()}
                </div>
                <div className="stp-photo-meta">
                  <span>
                    <span className="stp-row-title">{photo.account}</span>
                    <span className="stp-row-sub">
                      <span className="stp-mono">{photo.id}</span> · denunciada por 2 Contas
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
                    <XIcon size={14} aria-hidden="true" /> Remover
                  </button>
                  <button
                    type="button"
                    className="stp-btn"
                    data-kind="primary"
                    onClick={() => onDecide(photo, true)}
                  >
                    <CheckIcon size={14} aria-hidden="true" /> Manter
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
    text: 'Quem fez o quê no painel, numa linha do tempo com filtro por pessoa e por ação.',
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
          <Icon size={22} aria-hidden="true" />
          <b>Esta tela migra depois da direção aprovada</b>
          <span>{stub.text}</span>
        </div>
      </div>
    </div>
  );
}
