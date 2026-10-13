import { isLastingSanction, type SanctionMeasure } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { durationParts } from '@/lib/moderation';

/** "Gag de 1 h", "Ban permanente", "Kick", "Aviso". */
export function useMeasureLabel() {
  const t = useTranslations('moderation');
  return (measure: SanctionMeasure) => {
    const type = t(`types.${measure.type}`);
    if (!isLastingSanction(measure.type)) return t('measure.instant', { type });
    const parts = durationParts(measure.durationMinutes);
    if (parts.unit === 'permanent') return t('measure.permanent', { type });
    return t('measure.lasting', {
      type,
      duration: t(`duration.${parts.unit}`, { value: parts.value }),
    });
  };
}
