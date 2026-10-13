import type { ProfileSanctions, PublicSanction } from '@carmine/contracts';
import { getFormatter, getTranslations } from 'next-intl/server';
import { SectionTitle } from '@/components/section-title';
import { activeBadges, sanctionLength, untilKind } from '@/lib/moderation';
import { cn } from '@/lib/utils';

type BadgeType = 'ban' | 'gag' | 'mute';

/**
 * Selos das Punições em vigor, ao lado do nome no Perfil: "Banido até 20/10", "Silenciado no
 * chat até 14h". A cor de erro fica só no selo (ponto e fundo), nunca no resto da página.
 */
export async function SanctionBadges({ active }: { active: PublicSanction[] }) {
  const badges = activeBadges(active);
  if (badges.length === 0) return null;
  const t = await getTranslations('moderation');
  const tp = await getTranslations('profileSanctions');
  const format = await getFormatter();
  const now = new Date();
  return (
    <ul
      aria-label={tp('badgesLabel')}
      className="flex flex-wrap gap-1.5"
      data-testid="sanction-badges"
    >
      {badges.map((sanction) => {
        const kind = untilKind(sanction.endsAt, now);
        const at =
          sanction.endsAt === null
            ? ''
            : kind === 'time'
              ? format.dateTime(new Date(sanction.endsAt), { hour: 'numeric', minute: '2-digit' })
              : format.dateTime(new Date(sanction.endsAt), { day: '2-digit', month: '2-digit' });
        return (
          <li
            key={sanction.id}
            data-type={sanction.type}
            className="inline-flex min-h-6 items-center gap-1.5 rounded-sm bg-status-danger/12 px-2 text-[12px] font-semibold text-foreground"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-status-danger" />
            {t(`badge.${sanction.type as BadgeType}.${kind}`, { at })}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Histórico de Punições no Perfil (12 meses, sem avisos): tipo, Categoria genérica, data e
 * duração. Nunca o motivo livre. Só para quem está logado (`history` nulo para o visitante); sem
 * histórico, a seção não aparece.
 */
export async function SanctionHistory({ sanctions }: { sanctions: ProfileSanctions }) {
  const { history } = sanctions;
  if (history === null || history.length === 0) return null;
  const t = await getTranslations('moderation');
  const tp = await getTranslations('profileSanctions');
  const format = await getFormatter();
  const activeIds = new Set(sanctions.active.map((s) => s.id));

  return (
    <section
      aria-labelledby="punicoes"
      data-testid="sanction-history"
      className="animate-fade-up pt-10 [animation-delay:120ms]"
    >
      <SectionTitle id="punicoes">{tp('title')}</SectionTitle>
      <p className="-mt-1 pb-3 text-[13px] text-muted-foreground">{tp('subtitle')}</p>
      <table className="w-full border-collapse text-left text-[13.5px]">
        <thead className="text-xs text-muted-foreground max-md:sr-only">
          <tr>
            <th className="border-b border-line py-2 pr-3 font-semibold">{tp('columns.type')}</th>
            <th className="border-b border-line px-3 py-2 font-semibold">
              {tp('columns.category')}
            </th>
            <th className="border-b border-line px-3 py-2 font-semibold">{tp('columns.date')}</th>
            <th className="border-b border-line py-2 pl-3 font-semibold">
              {tp('columns.duration')}
            </th>
          </tr>
        </thead>
        <tbody>
          {history.map((sanction) => {
            const length = sanctionLength(sanction);
            const isActive = activeIds.has(sanction.id);
            return (
              <tr
                key={sanction.id}
                data-type={sanction.type}
                className="border-b border-line/60 max-md:grid max-md:grid-cols-[1fr_auto] max-md:gap-x-3 max-md:gap-y-0.5 max-md:py-3"
              >
                <td className="py-2.5 pr-3 font-semibold max-md:p-0">
                  <span className="inline-flex items-center gap-2">
                    {t(`types.${sanction.type}`)}
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                        <span
                          aria-hidden="true"
                          className="size-1.5 rounded-full bg-status-danger"
                        />
                        {tp('active')}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-3 py-2.5 max-md:col-start-1 max-md:row-start-2 max-md:p-0 max-md:text-muted-foreground">
                  {t(`categories.${sanction.category}`)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground max-md:col-start-2 max-md:row-start-1 max-md:p-0 max-md:text-right">
                  <time dateTime={sanction.startsAt}>
                    {format.dateTime(new Date(sanction.startsAt), { dateStyle: 'short' })}
                  </time>
                </td>
                <td
                  className={cn(
                    'py-2.5 pl-3 max-md:col-start-2 max-md:row-start-2 max-md:p-0 max-md:text-right',
                    sanction.revoked && 'text-muted-foreground',
                  )}
                >
                  {t(`duration.${length.unit}`, { value: length.value })}
                  {sanction.revoked ? (
                    <span className="block text-[12px] text-muted-foreground">{tp('revoked')}</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
