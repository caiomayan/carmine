import { APPEAL_RESPONSE_HOURS } from '@carmine/contracts';
import { getTranslations } from 'next-intl/server';
import { siDiscord } from 'simple-icons';
import { ExternalLinkIcon } from '@/components/icons/animated/external-link';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { BrandIcon } from '@/components/icons/brand-icon';
import { Button } from '@/components/ui/button';
import { DISCORD_URL } from '@/lib/social';

/** Como recorrer de uma Punição: ticket no Discord, o que mandar e o prazo de resposta. */
export async function AppealSteps() {
  const t = await getTranslations('rules.appeal');
  return (
    <div className="grid max-w-[68ch] gap-4">
      <ol className="grid list-decimal gap-1.5 pl-5 text-md leading-[1.65] marker:font-semibold marker:text-muted-foreground">
        <li className="pl-1">{t('steps.ticket')}</li>
        <li className="pl-1">{t('steps.details')}</li>
        <li className="pl-1">{t('steps.answer', { hours: APPEAL_RESPONSE_HOURS })}</li>
      </ol>
      <p className="text-[13.5px] text-muted-foreground">{t('notes')}</p>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" data-icon-trigger>
            <BrandIcon icon={siDiscord} size={15} />
            {t('discord')}
            <AnimatedIcon icon={ExternalLinkIcon} size={13} />
          </a>
        </Button>
      </div>
    </div>
  );
}
