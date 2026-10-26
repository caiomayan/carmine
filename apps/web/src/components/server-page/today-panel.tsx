'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { StatusDot } from '@/components/status-dot';
import type { ArtPair } from '@/components/vida/map-art';
import { MapPicture } from '@/components/vida/map-picture';
import { Ticker } from '@/components/vida/ticker';
import { mapDisplayName, mapSlug } from '@/lib/map-art';
import type { Collectable, Today } from '@/lib/server-page/types';
import { busiestHour, ctShare, firstActiveHour } from '@/lib/server-page/view';
import { CollectingBlock } from './collecting-block';

/** O dia no relógio de Brasília ("26 de outubro"). */
function useDayLabel() {
  const format = useFormatter();
  return (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00-03:00`), {
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Sao_Paulo',
    });
}

/**
 * "Hoje no servidor": os números do dia, os mapas (horário, rounds e rounds ganhos CT × TR somados por mapa: o
 * Retake não tem partida) e o movimento por hora. Sem rounds (Deathmatch, ou plugin antigo) nada vira zero: some o
 * que depende deles e o gráfico passa a mostrar os jogadores por hora. Sem o histórico da API ainda, o bloco
 * "coletando".
 */
export function TodaySection({
  today,
  live,
  art,
}: {
  today: Collectable<Today>;
  live: boolean;
  art: Record<string, ArtPair>;
}) {
  const t = useTranslations('serverPage.today');
  const dayLabel = useDayLabel();

  return (
    <section aria-labelledby="vs-today" className="vs-section" data-testid="hoje">
      <div className="vs-section-head">
        <h2 id="vs-today" className="v-title">
          {t('title')}
        </h2>
        {today.status === 'ready' ? (
          <p className="vs-section-note">{t('note', { date: dayLabel(today.data.date) })}</p>
        ) : null}
      </div>

      {today.status === 'collecting' ? (
        <CollectingBlock kind="today" since={today.since} />
      ) : (
        <>
          <Tiles today={today.data} />
          <div className="vs-today-grid">
            <MapsCard today={today.data} live={live} art={art} />
            <HoursCard today={today.data} />
          </div>
          {today.data.since ? (
            <p className="vs-since">
              {t('since', { date: dayLabel(today.data.since.slice(0, 10)) })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function Tiles({ today }: { today: Today }) {
  const t = useTranslations('serverPage.today.tiles');
  const sr = useTranslations('serverPage.today.maps');
  const { rounds } = today;
  const share = rounds ? ctShare(rounds.ctWins, rounds.tWins) : 50;
  // Quantos blocos há (o CSS reparte as colunas por isso): sem rounds, só o dos mapas.
  const count =
    (rounds ? 2 : 1) + (today.peakPlayers ? 1 : 0) + (today.uniquePlayers !== null ? 1 : 0);

  return (
    <div className="vs-tiles" data-n={count}>
      {rounds ? (
        <>
          <div className="vs-tile">
            <p className="v-label">{t('rounds')}</p>
            <p className="vs-tile-num v-serif">
              <Ticker value={rounds.played} />
            </p>
            <p className="vs-tile-foot">{t('roundsFoot', { count: today.maps.length })}</p>
          </div>
          <div className="vs-tile">
            <p className="v-label">{t('won')}</p>
            <p className="vs-tile-num v-serif tabular-nums">
              <span>
                <span className="sr-only">{sr('ct')} </span>
                {rounds.ctWins}
              </span>
              <span aria-hidden="true" className="vs-tile-x">
                ×
              </span>
              <span>
                <span className="sr-only">{sr('t')} </span>
                {rounds.tWins}
              </span>
            </p>
            <div className="vs-split vs-split-sm" aria-hidden="true">
              <i data-side="ct" style={{ '--rest': `${100 - share}%` } as React.CSSProperties} />
            </div>
            <p className="vs-tile-foot" aria-hidden="true">
              <span className="vs-key" data-side="ct">
                {sr('ct')}
              </span>{' '}
              <span className="vs-key" data-side="t">
                {sr('t')}
              </span>
            </p>
          </div>
        </>
      ) : (
        <div className="vs-tile">
          <p className="v-label">{t('maps')}</p>
          <p className="vs-tile-num v-serif">
            <Ticker value={today.maps.length} />
          </p>
        </div>
      )}
      {today.peakPlayers ? (
        <div className="vs-tile">
          <p className="v-label">{t('peak')}</p>
          <p className="vs-tile-num v-serif">
            <Ticker value={today.peakPlayers.count} />
          </p>
          <p className="vs-tile-foot">{t('peakAt', { time: today.peakPlayers.at })}</p>
        </div>
      ) : null}
      {today.uniquePlayers !== null ? (
        <div className="vs-tile">
          <p className="v-label">{t('unique')}</p>
          <p className="vs-tile-num v-serif">
            <Ticker value={today.uniquePlayers} />
          </p>
          <p className="vs-tile-foot">{t('uniqueFoot')}</p>
        </div>
      ) : null}
    </div>
  );
}

function MapsCard({
  today,
  live,
  art,
}: {
  today: Today;
  live: boolean;
  art: Record<string, ArtPair>;
}) {
  const t = useTranslations('serverPage.today.maps');
  const anySides = today.maps.some((row) => row.ctWins !== null && row.tWins !== null);
  return (
    <div className="vs-card">
      <h3 className="vs-card-title">{t('title')}</h3>
      <ol className="vs-maps">
        {[...today.maps].reverse().map((row) => {
          const slug = mapSlug(row.map) ?? '';
          const now = row.to === null;
          const warming = now && row.rounds === 0;
          const hasSides = row.ctWins !== null && row.tWins !== null;
          const share = ctShare(row.ctWins ?? 0, row.tWins ?? 0);
          return (
            <li key={`${row.map}-${row.from}`} className="vs-map-row" data-now={now || undefined}>
              <span className="vs-thumb" aria-hidden="true">
                <MapPicture map={slug} art={art[slug]} sizes="96px" className="size-full" />
              </span>
              <span className="vs-map-name">
                <span className="v-sign">{mapDisplayName(row.map)}</span>
                <span className="vs-map-time tabular-nums">
                  {row.to === null
                    ? t('rangeNow', { from: row.from })
                    : t('range', { from: row.from, to: row.to })}
                </span>
              </span>
              <span className="vs-map-score tabular-nums">
                {now && live ? (
                  <span className="vs-now">
                    <StatusDot tone={warming ? 'warn' : 'online'} pulse />{' '}
                    {warming ? t('warming') : t('now')}
                  </span>
                ) : null}
                {warming ? null : (
                  <>
                    {hasSides ? (
                      <>
                        <span>
                          <span className="sr-only">{t('ct')} </span>
                          {row.ctWins}
                          <span aria-hidden="true" className="vs-map-x">
                            ×
                          </span>
                          <span className="sr-only"> {t('t')} </span>
                          {row.tWins}
                        </span>
                        <span className="vs-mini" aria-hidden="true">
                          <i
                            data-side="ct"
                            style={{ '--rest': `${100 - share}%` } as React.CSSProperties}
                          />
                        </span>
                      </>
                    ) : null}
                    {row.rounds !== null ? (
                      <span className="vs-map-rounds">{t('rounds', { count: row.rounds })}</span>
                    ) : null}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {anySides ? <p className="vs-card-foot">{t('foot')}</p> : null}
    </div>
  );
}

function HoursCard({ today }: { today: Today }) {
  const t = useTranslations('serverPage.today.hours');
  const players = today.hoursMetric === 'players';
  const busiest = busiestHour(today.hours);
  const first = firstActiveHour(today.hours);
  const max = Math.max(1, ...today.hours);

  return (
    <div className="vs-card vs-card-chart">
      <h3 className="vs-card-title">{players ? t('titlePlayers') : t('title')}</h3>
      <div
        className="vs-hours"
        role="img"
        aria-label={
          busiest
            ? t(players ? 'ariaPlayers' : 'aria', { hour: busiest.hour, count: busiest.rounds })
            : t(players ? 'nonePlayers' : 'none')
        }
      >
        {today.hours.map((count, hour) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: as 24 horas do dia, sempre na mesma ordem
            key={hour}
            className="vs-hour"
            data-now={hour === Number(today.clock.slice(0, 2)) || undefined}
            data-empty={count === 0 || undefined}
            title={t(players ? 'barPlayers' : 'bar', { hour, count })}
          >
            <i style={{ height: `${Math.max(2, (count / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="vs-hour-axis">
        {[0, 6, 12, 18, 23].map((hour) => (
          <span key={hour} style={{ left: `${((hour + 0.5) / 24) * 100}%` }}>
            {t('axis', { hour })}
          </span>
        ))}
      </div>
      <p className="vs-card-foot">
        {first === null ? t(players ? 'nonePlayers' : 'none') : t('from', { hour: first })}
        {busiest ? ` ${t('busiest', { hour: busiest.hour })}` : ''}
      </p>
    </div>
  );
}
