'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export type CollectingKind = 'score' | 'leader' | 'roster' | 'today';

/**
 * Cena quieta de um bloco da S12b que a API ainda não entrega: um esboço apagado do que vai ser e a explicação, com o
 * "coletando desde X" (ou, sem data, que o dado ainda não é guardado). Nenhum valor aparece, só o desenho do lugar.
 * `hero` é a versão de vidro ao lado do nome do servidor; sem ele, é um painel da página.
 */
export function CollectingBlock({
  kind,
  since,
  hero = false,
  className,
}: {
  kind: CollectingKind;
  /** Desde quando há dado detalhado (ISO); nulo se a coleta ainda não começou. */
  since: string | null;
  hero?: boolean;
  className?: string;
}) {
  const t = useTranslations('serverPage.collecting');
  const format = useFormatter();
  const sinceText = since
    ? t('since', { date: format.dateTime(new Date(since), { day: 'numeric', month: 'long' }) })
    : t('never');

  return (
    <section
      data-testid={`collecting-${kind}`}
      aria-label={t(`${kind}.title`)}
      className={cn(
        hero ? 'vs-score vs-collecting' : 'vs-panel-collecting v-panel v-panel-lg',
        className,
      )}
    >
      <header className="vs-collecting-head" data-hero={hero || undefined}>
        {hero ? <p className="v-label">{t(`${kind}.title`)}</p> : null}
        <span className="vs-soft-chip">{t('status')}</span>
      </header>
      <Sketch kind={kind} />
      <div className="vs-collecting-text">
        <p>{t(`${kind}.body`)}</p>
        <p className="vs-collecting-since">{sinceText}</p>
      </div>
    </section>
  );
}

/** O esboço apagado: decorativo, sem texto nem número. */
function Sketch({ kind }: { kind: CollectingKind }) {
  if (kind === 'score') {
    return (
      <div aria-hidden="true" className="vs-sketch-score v-sign">
        <span>–</span>
        <span className="vs-sketch-x">×</span>
        <span>–</span>
      </div>
    );
  }
  if (kind === 'leader') {
    return (
      <div aria-hidden="true" className="vs-sketch-leader">
        <span className="vs-sketch-disc" />
        <span className="vs-sketch-lines">
          <i />
          <i />
        </span>
      </div>
    );
  }
  if (kind === 'roster') {
    return (
      <ul aria-hidden="true" className="vs-sketch-rows">
        {[0.13, 0.1, 0.08, 0.06].map((alpha) => (
          <li key={alpha}>
            <span className="vs-sketch-disc" style={{ opacity: alpha + 0.05 }} />
            <span className="vs-sketch-lines">
              <i style={{ opacity: alpha + 0.04 }} />
            </span>
            <span className="vs-sketch-nums" style={{ opacity: alpha }} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div aria-hidden="true" className="vs-sketch-today">
      <span className="vs-sketch-tiles">
        {[0, 1, 2, 3].map((index) => (
          <i key={index} />
        ))}
      </span>
      <span className="vs-sketch-bars">
        {Array.from({ length: 24 }, (_, hour) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: as 24 horas do dia, decorativas e fixas
            key={hour}
            style={{ height: `${10 + ((hour * 37) % 6) * 4}%` }}
          />
        ))}
      </span>
    </div>
  );
}
