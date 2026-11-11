import { presetLimitFor } from '@carmine/contracts/plans';
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
 * "O que muda com um plano": o plano grátis ao lado do Capo e do Padrinho. Só entra o que o produto já faz (limites de
 * Preset por plano, Itens exclusivos, a Vaga reservada e o cargo no Discord): o que ainda não existe (Salas, modo
 * anônimo, o assistente) entra quando cada fatia entrar.
 */
export function Compare() {
  const t = useTranslations('vip.compare');
  const free = [
    t('freeItems.skins'),
    t('freeItems.attachments'),
    t('freeItems.preset', { count: presetLimitFor(null) }),
    t('freeItems.servers'),
  ];
  const capo = [
    t('capoItems.all'),
    t('capoItems.reserved'),
    t('capoItems.presets', { count: presetLimitFor('capo') }),
    t('capoItems.agents'),
    t('capoItems.attributes'),
    t('capoItems.discord'),
  ];
  const padrinho = [
    t('padrinhoItems.all'),
    t('padrinhoItems.presets', { count: presetLimitFor('padrinho') }),
    t('padrinhoItems.discord'),
  ];

  return (
    <section aria-labelledby="vip-compare" className="vp-section" data-testid="vip-compare">
      <h2 id="vip-compare" className="v-title">
        {t('title')}
      </h2>
      <div className="vp-compare">
        <Column name={t('free')} items={free} plan="free" />
        <Column name={t('capo')} items={capo} plan="capo" />
        <Column name={t('padrinho')} items={padrinho} plan="padrinho" note={t('reservedNote')} />
      </div>
    </section>
  );
}

function Column({
  name,
  items,
  plan,
  note,
}: {
  name: string;
  items: string[];
  plan: 'free' | 'capo' | 'padrinho';
  note?: string;
}) {
  const paid = plan !== 'free';
  return (
    <div className={paid ? 'vp-plan vp-plan-vip' : 'vp-plan'} data-plan={plan}>
      <h3 className="vp-plan-name">
        {paid ? <span aria-hidden="true" className="vp-dot" /> : null}
        {name}
      </h3>
      <ul className="vp-list">
        {items.map((item) => (
          <li key={item}>
            <Check />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="vp-plan-note">{note}</p> : null}
    </div>
  );
}
