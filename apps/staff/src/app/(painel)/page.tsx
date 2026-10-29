import type { StaffAvatarCasePage } from '@carmine/contracts/avatar';
import type { LiveServerList } from '@carmine/contracts/live-servers';
import type { StaffReportPage } from '@carmine/contracts/reports';
import { staffCan } from '@carmine/contracts/staff';
import type { StaffPaymentPage } from '@carmine/contracts/staff-payments';
import {
  ActivityIcon,
  ArrowUpRightIcon,
  FlagIcon,
  ImageIcon,
  RadioIcon,
  ServerIcon,
  ShoppingBagIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { getPanelSession } from '@/lib/session';
import {
  brasiliaDay,
  brl,
  type Deadline,
  deadlineOf,
  greeting,
  PHOTO_DEADLINE_HOURS,
  REPORT_DEADLINE_HOURS,
} from '@/lib/time';

export const metadata: Metadata = { title: 'Início' };
export const dynamic = 'force-dynamic';

const DATE = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const soonLabel = (d: Deadline) =>
  d.leftMin < 0 ? d.label : `vence em ${d.label.replace(' restantes', '')}`;

function Arrow({ href, label }: { href: string; label: string }) {
  return (
    <Link className="stp-arrow" href={href as '/'} prefetch={false} aria-label={label}>
      <ArrowUpRightIcon size={16} aria-hidden="true" />
    </Link>
  );
}

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

/** A fila com o prazo: o número, a barra que esvazia e o menor prazo. Vira destaque cheio quando passa de 80% do prazo. */
function QueueCard({
  title,
  icon,
  href,
  count,
  oldest,
  hours,
  unavailable,
}: {
  title: string;
  icon: ReactNodeIcon;
  href: string;
  count: number | null;
  oldest: Deadline | null;
  hours: number;
  unavailable: boolean;
}) {
  const Icon = icon;
  const hot = oldest !== null && oldest.remaining < 0.2;
  return (
    <section className="stp-card" data-hl={hot ? '' : undefined} aria-label={title}>
      <div className="stp-card-top">
        <div className="stp-card-title">
          <span className="stp-card-ico">
            <Icon size={16} aria-hidden="true" />
          </span>
          <h2>{title}</h2>
        </div>
        <Arrow href={href} label={`Abrir ${title}`} />
      </div>
      {unavailable || count === null ? (
        <div className="stp-card-sub">Sem dado: a API não respondeu.</div>
      ) : (
        <>
          <div className="stp-big">{count}</div>
          {oldest ? (
            <>
              <span
                className="stp-meter"
                data-tone={oldest.tone === 'ok' ? undefined : oldest.tone}
                aria-hidden="true"
              >
                <i style={{ width: `${Math.max(3, Math.round(oldest.remaining * 100))}%` }} />
              </span>
              <div className="stp-card-sub">
                {soonLabel(oldest)} · prazo de {hours} h
              </div>
            </>
          ) : (
            <div className="stp-card-sub">fila vazia</div>
          )}
        </>
      )}
    </section>
  );
}

type ReactNodeIcon = typeof FlagIcon;

/**
 * O Início do painel (S25): os números de agora, todos da API. Cada fila mostra o seu prazo (foto 24 h, Denúncia 72 h);
 * o que o papel não vê não aparece; o que a API não respondeu diz isso, sem número inventado.
 */
export default async function InicioPage() {
  const session = await getPanelSession();
  if (session.status !== 'staff') return null;
  const { staffRole: role, account } = session.session;
  const now = Date.now();

  const [live, reports, photos, payments] = await Promise.all([
    apiGet<LiveServerList>('/api/servers'),
    staffCan(role, 'reports.handle')
      ? apiGet<StaffReportPage>('/api/staff/reports?status=open&limit=100')
      : null,
    staffCan(role, 'avatars.moderate')
      ? apiGet<StaffAvatarCasePage>('/api/staff/avatar-reports?status=open&limit=100')
      : null,
    staffCan(role, 'payments.manage')
      ? apiGet<StaffPaymentPage>('/api/staff/payments?limit=100')
      : null,
  ]);

  const oldestReport =
    reports?.ok && reports.data.reports[0]
      ? deadlineOf(reports.data.reports[0].createdAt, REPORT_DEADLINE_HOURS, now)
      : null;
  const oldestPhoto =
    photos?.ok && photos.data.cases[0]
      ? deadlineOf(photos.data.cases[0].reports.firstAt, PHOTO_DEADLINE_HOURS, now)
      : null;

  const today = brasiliaDay(now);
  const paidToday = payments?.ok
    ? payments.data.payments.filter(
        (p) => p.approvedAt && brasiliaDay(new Date(p.approvedAt).getTime()) === today,
      )
    : [];
  const refundedToday = payments?.ok
    ? payments.data.payments.filter(
        (p) => p.refundedCents > 0 && brasiliaDay(new Date(p.createdAt).getTime()) === today,
      )
    : [];
  const revenueToday = paidToday.reduce((sum, p) => sum + p.amountCents, 0);

  const offline = live.ok ? live.data.servers.filter((s) => s.state === 'offline') : [];
  const firstName = account.displayName;

  return (
    <div className="stp-page" data-testid="stp-home">
      <section className="stp-hero" aria-labelledby="stp-hello">
        <div className="stp-hero-row">
          <div>
            <h1 id="stp-hello">
              {greeting(now)}, <em>{firstName}</em>
            </h1>
            <p>{DATE.format(now)}</p>
          </div>
        </div>
      </section>

      <div className="stp-grid">
        <section className="stp-card" aria-label="Jogadores online">
          <div className="stp-card-top">
            <div className="stp-card-title">
              <span className="stp-card-ico">
                <ActivityIcon size={16} aria-hidden="true" />
              </span>
              <h2>Jogadores online</h2>
            </div>
            {staffCan(role, 'servers.edit') ? (
              <Arrow href="/servidores" label="Abrir Servidores" />
            ) : null}
          </div>
          {live.ok ? (
            <div className="stp-big" data-testid="stp-online">
              {live.data.summary.players}
            </div>
          ) : (
            <div className="stp-card-sub">Sem dado: a API não respondeu.</div>
          )}
        </section>

        <section className="stp-card" aria-label="Servidores no ar">
          <div className="stp-card-top">
            <div className="stp-card-title">
              <span className="stp-card-ico">
                <ServerIcon size={16} aria-hidden="true" />
              </span>
              <h2>Servidores no ar</h2>
            </div>
            {staffCan(role, 'servers.edit') ? (
              <Arrow href="/servidores" label="Abrir Servidores" />
            ) : null}
          </div>
          {live.ok ? (
            <>
              <div className="stp-big">
                {live.data.summary.online}
                <small> de {live.data.servers.length}</small>
              </div>
              <ul className="stp-servers" aria-label="Estado de cada servidor">
                {live.data.servers.map((s) => (
                  <li key={s.id}>
                    <span>{s.showcaseName ?? s.name}</span>
                    <span className="stp-dot" data-tone={s.state === 'offline' ? 'danger' : 'ok'}>
                      <span className="stp-sr">{s.state === 'offline' ? 'caído' : 'no ar'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="stp-card-sub">Sem dado: a API não respondeu.</div>
          )}
        </section>

        {reports ? (
          <QueueCard
            title="Denúncias esperando"
            icon={FlagIcon}
            href="/denuncias"
            count={reports.ok ? reports.data.openCount : null}
            oldest={oldestReport}
            hours={REPORT_DEADLINE_HOURS}
            unavailable={!reports.ok}
          />
        ) : null}
        {photos ? (
          <QueueCard
            title="Fotos denunciadas"
            icon={ImageIcon}
            href="/fotos"
            count={photos.ok ? photos.data.openCount : null}
            oldest={oldestPhoto}
            hours={PHOTO_DEADLINE_HOURS}
            unavailable={!photos.ok}
          />
        ) : null}
      </div>

      <div className="stp-split">
        {payments ? (
          <section className="stp-card" aria-label="Compras hoje">
            <div className="stp-card-top">
              <div className="stp-card-title">
                <span className="stp-card-ico">
                  <ShoppingBagIcon size={16} aria-hidden="true" />
                </span>
                <h2>Compras hoje</h2>
              </div>
              <Arrow href="/pagamentos" label="Abrir Pagamentos" />
            </div>
            {payments.ok ? (
              <>
                <div className="stp-big" data-testid="stp-sales">
                  <Money cents={revenueToday} />
                </div>
                <div className="stp-card-sub">
                  {paidToday.length} {paidToday.length === 1 ? 'compra' : 'compras'} ·{' '}
                  {refundedToday.length} {refundedToday.length === 1 ? 'reembolso' : 'reembolsos'}
                  {payments.data.nextCursor ? ' (nas últimas 100)' : ''}
                </div>
              </>
            ) : (
              <div className="stp-card-sub">Sem dado: a API não respondeu.</div>
            )}
          </section>
        ) : null}

        <div className="stp-col">
          <section className="stp-card" aria-label="Alertas">
            <div className="stp-card-top">
              <div className="stp-card-title">
                <span className="stp-card-ico">
                  <TriangleAlertIcon size={16} aria-hidden="true" />
                </span>
                <h2>Alertas</h2>
              </div>
            </div>
            {live.ok ? (
              offline.length ? (
                <ul className="stp-list">
                  {offline.map((s) => (
                    <li key={s.id} className="stp-purchase">
                      <span>
                        <span className="stp-row-title">Servidor sem batimento</span>
                        <span className="stp-row-sub">{s.showcaseName ?? s.name} não responde</span>
                      </span>
                      <span className="stp-dot" data-tone="danger">
                        <span className="stp-sr">urgente</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="stp-card-sub">Nenhum alerta: todos os servidores respondem.</div>
              )
            ) : (
              <div className="stp-card-sub">Sem dado: a API não respondeu.</div>
            )}
          </section>

          <section className="stp-card" data-soon aria-label="Salas ao vivo">
            <div className="stp-card-top">
              <div className="stp-card-title">
                <span className="stp-card-ico">
                  <RadioIcon size={16} aria-hidden="true" />
                </span>
                <h2>Salas ao vivo</h2>
              </div>
            </div>
            <div className="stp-card-sub">Chega com as Salas (S23).</div>
          </section>
        </div>
      </div>
    </div>
  );
}
