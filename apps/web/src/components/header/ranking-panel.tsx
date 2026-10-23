'use client';

import Link from 'next/link';
import { useNow, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { EncryptedText } from '@/components/ui/encrypted-text';
import { closesIn } from '@/lib/header-previews/countdown';
import type { RankingModeView, RankingRowView, RankingView } from '@/lib/header-previews/view';
import { cn } from '@/lib/utils';
import { BlockTitle, PanelFooterLink, rowLink, WithView } from './preview-parts';

/**
 * O painel "Ranking": a minha posição nesta semana em cada Modo (leva ao Ranking do Modo, com a
 * minha linha em foco), o top 3 (cada um leva ao Perfil; o Perfil privado continua anônimo, como
 * no Ranking) e o tempo até a semana fechar (Brasília). Sem sessão, só o top 3.
 */
export function RankingPanel() {
  return (
    <WithView>
      {(view) => <RankingContent ranking={view.ranking} signedIn={view.signedIn} />}
    </WithView>
  );
}

function RankingContent({ ranking, signedIn }: { ranking: RankingView | null; signedIn: boolean }) {
  const t = useTranslations('headerPreviews.ranking');
  if (!ranking) {
    return (
      <div className="grid gap-1 p-3" data-testid="preview-ranking-empty">
        <p className="text-body-sm text-muted-foreground">{t('none')}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3" data-testid="preview-ranking">
      <div className="grid grid-cols-2 gap-4">
        {ranking.modes.map((mode) => (
          <ModeColumn key={mode.mode} mode={mode} signedIn={signedIn} />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <Countdown closesAt={ranking.closesAt} />
        <PanelFooterLink href="/ranking">{t('open')}</PanelFooterLink>
      </div>
    </div>
  );
}

function ModeColumn({ mode, signedIn }: { mode: RankingModeView; signedIn: boolean }) {
  const t = useTranslations('headerPreviews');
  return (
    <section className="grid content-start gap-2" data-testid="preview-mode" data-mode={mode.mode}>
      <Link
        href={mode.href}
        className="w-fit rounded-md px-2.5 py-1 -mx-2.5 text-body-sm font-semibold transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover)"
      >
        {t(`modes.${mode.mode}`)}
      </Link>

      {signedIn && mode.mine ? <Mine mine={mode.mine} /> : null}

      <BlockTitle className="px-2.5">{t('ranking.top')}</BlockTitle>
      {mode.top.length > 0 ? (
        <ol className="grid">
          {mode.top.map((row) => (
            <li key={row.position}>
              <TopRow row={row} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-2.5 text-body-sm text-muted-foreground">{t('ranking.none')}</p>
      )}
    </section>
  );
}

function Mine({ mine }: { mine: NonNullable<RankingModeView['mine']> }) {
  const t = useTranslations('headerPreviews.ranking');
  return (
    <Link
      href={mine.href}
      data-testid="preview-mine"
      className="grid gap-0.5 rounded-lg bg-(--fill-rest) px-2.5 py-2 transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover)"
    >
      <span className="label-caps muted-on-fill">{t('mine')}</span>
      {mine.position !== null ? (
        <span className="text-lg font-semibold tabular-nums">
          {t('position', { position: mine.position })}
        </span>
      ) : mine.progress ? (
        <span className="text-body-sm">
          {mine.progress.unit === 'rounds'
            ? t('progressRounds', { missing: mine.progress.missing })
            : t('progressMinutes', { missing: mine.progress.missing })}
        </span>
      ) : null}
    </Link>
  );
}

function TopRow({ row }: { row: RankingRowView }) {
  const t = useTranslations('headerPreviews.ranking');
  const content = (
    <>
      <span className="w-5 shrink-0 text-body-sm font-semibold muted-on-fill tabular-nums">
        {row.position}
      </span>
      <Avatar src={row.avatarUrl} name={row.name} size={24} className="bg-(--fill-hover)" />
      <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{row.name}</span>
      {row.self ? <span className="shrink-0 text-caption muted-on-fill">{t('you')}</span> : null}
    </>
  );
  // Perfil privado: sem destino, como no Ranking (nada leva à Conta).
  return row.href ? (
    <Link href={row.href} className={cn(rowLink, 'min-h-10 py-1.5')} data-testid="preview-top-row">
      {content}
    </Link>
  ) : (
    <div
      className={cn(rowLink, 'min-h-10 py-1.5 hover:bg-transparent')}
      data-testid="preview-top-row"
      data-private=""
    >
      {content}
    </div>
  );
}

/**
 * A contagem até a semana fechar, atualizada a cada minuto com o painel aberto. Se a contagem
 * zera com o painel aberto (a virada da semana), "Semana encerrada" decifra no lugar dela; quem
 * abre o painel com a semana já encerrada vê o texto parado.
 */
function Countdown({ closesAt }: { closesAt: string }) {
  const t = useTranslations('headerPreviews.ranking.closes');
  const now = useNow({ updateInterval: 60_000 });
  const left = closesIn(closesAt, now.getTime());
  const closed = left.unit === 'closed';
  const wasCounting = useRef(!closed);
  const [turned, setTurned] = useState(false);
  useEffect(() => {
    if (closed && wasCounting.current) setTurned(true);
    wasCounting.current = !closed;
  }, [closed]);
  return (
    <p
      className="px-2.5 text-body-sm text-muted-foreground tabular-nums"
      data-testid="preview-countdown"
    >
      {left.unit === 'closed' ? (
        turned ? (
          <EncryptedText text={t('closed')} />
        ) : (
          t('closed')
        )
      ) : left.unit === 'days' ? (
        t('days', { days: left.days, hours: left.hours })
      ) : left.unit === 'hours' ? (
        t('hours', { hours: left.hours, minutes: left.minutes })
      ) : (
        t('minutes', { minutes: left.minutes })
      )}
    </p>
  );
}
