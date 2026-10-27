import { PRESETS_FREE_LIMIT, PRESETS_VIP_LIMIT } from '@carmine/contracts/rules';
import { useTranslations } from 'next-intl';

function Check() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="vp-check"
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

/**
 * "O que muda com o VIP": o plano grátis ao lado do VIP. Só entra o que o produto já faz (limites de Preset das
 * regras compartilhadas, Itens que exigem VIP, a Vaga reservada e o cargo no Discord).
 */
export function Compare() {
  const t = useTranslations('vip.compare');
  const free = [
    t('freeItems.skins'),
    t('freeItems.attachments'),
    t('freeItems.preset', { count: PRESETS_FREE_LIMIT }),
    t('freeItems.servers'),
  ];
  const vip = [
    t('vipItems.all'),
    t('vipItems.reserved'),
    t('vipItems.presets', { count: PRESETS_VIP_LIMIT }),
    t('vipItems.agents'),
    t('vipItems.attributes'),
    t('vipItems.discord'),
  ];

  return (
    <section aria-labelledby="vip-compare" className="vp-section" data-testid="vip-compare">
      <h2 id="vip-compare" className="v-title">
        {t('title')}
      </h2>
      <div className="vp-compare">
        <div className="vp-plan">
          <h3 className="vp-plan-name">{t('free')}</h3>
          <ul className="vp-list">
            {free.map((item) => (
              <li key={item}>
                <Check />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="vp-plan vp-plan-vip">
          <h3 className="vp-plan-name">
            <span aria-hidden="true" className="vp-dot" />
            {t('vip')}
          </h3>
          <ul className="vp-list">
            {vip.map((item) => (
              <li key={item}>
                <Check />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="vp-plan-note">{t('reservedNote')}</p>
        </div>
      </div>
    </section>
  );
}
