'use client';

import type { LiveServer } from '@carmine/contracts';
import { COLLECTING_EXTRAS, type ServerExtras } from './types';

/**
 * Os blocos da S12b da página do servidor (placar ao vivo, jogadores, histórico do dia). A API ainda não os entrega:
 * até lá todos ficam "coletando" (a página mostra o estado vazio, nunca um número inventado). Este é o único lugar
 * que passa a buscar os dados quando os contratos entrarem (`match` no `LiveServer`, `/servers/{id}/players` e
 * `/servers/{id}/today`): o resto da página só lê um {@link ServerExtras}.
 */
export function useServerExtras(_server: LiveServer): ServerExtras {
  return COLLECTING_EXTRAS;
}
