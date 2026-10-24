'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ActivityItemView } from '@/lib/activity/view';

/**
 * A frase de um acontecimento ("Ana entrou em Retake SP·1"), com o nome em destaque. As mesmas mensagens da faixa
 * de atividade (#71), que a Home usa no trilho e no Marquee.
 */
export function ActivityText({ item }: { item: ActivityItemView }) {
  const t = useTranslations('activity');
  const rich = {
    b: (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>,
    player: item.player.name,
  };
  switch (item.kind) {
    case 'joined':
      return t.rich('joined', { ...rich, server: item.server });
    case 'multi_kill':
      return t.rich('multiKill', { ...rich, server: item.server, kills: item.kills });
    case 'new_leader':
      return t.rich('newLeader', { ...rich, mode: t(`modes.${item.mode}`) });
    case 'skin_equipped':
      return t.rich('skinEquipped', { ...rich, skin: item.skin });
  }
}
