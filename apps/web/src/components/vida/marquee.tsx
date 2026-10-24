'use client';

import { ACTIVITY_POOL, PEOPLE, type SkinInfo } from './data';
import { Face } from './face';

/**
 * Marquee da atividade (a proposta de convivência com o feed): onde há trilho (a partir de 1280 px) o feed vive
 * lá com a lista animada; abaixo disso não há trilho, então a atividade vira uma faixa que corre sozinha, de um
 * item só de altura, e para com o mouse ou o foco. Com movimento reduzido a faixa fica parada e rola à mão.
 */
function line(ev: (typeof ACTIVITY_POOL)[number], skins: Record<number, SkinInfo>): string {
  switch (ev.type) {
    case 'multi_kill':
      return `fez ${ev.kills} abates · ${ev.server}`;
    case 'skin_equipped': {
      const s = skins[ev.skin];
      return `equipou ${s ? `${s.title} | ${s.subtitle}` : 'uma skin'}`;
    }
    case 'joined':
      return `entrou · ${ev.server}`;
    case 'new_leader':
      return `assumiu a liderança · ${ev.mode === 'retake' ? 'Retake' : 'Deathmatch'}`;
  }
}

export function ActivityMarquee({ skins, live }: { skins: Record<number, SkinInfo>; live: boolean }) {
  const items = ACTIVITY_POOL.slice(0, 8);
  const track = (copy: number) =>
    items.map((ev) => {
      const person = PEOPLE[ev.person];
      if (!person) return null;
      return (
        <li
          key={`${copy}-${ev.id}`}
          className="flex shrink-0 items-center gap-2.5 rounded-full bg-(--fill-rest) py-1.5 pr-4 pl-1.5 text-body-sm whitespace-nowrap"
        >
          <Face name={person.name} hue={person.hue} size={28} />
          <span>
            <b className="font-semibold">{person.name}</b> <span className="text-muted-foreground">{line(ev, skins)}</span>
          </span>
        </li>
      );
    });
  return (
    <section aria-label={live ? 'Ao vivo agora' : 'Atividade recente'} data-testid="vida-marquee" className="v-marquee">
      <ul className="v-marquee-track" aria-hidden={false}>
        {track(0)}
        <span aria-hidden="true" className="contents">
          {track(1)}
        </span>
      </ul>
    </section>
  );
}
