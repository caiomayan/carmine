'use client';

import { createContext, useContext } from 'react';

/**
 * O elemento `.stp` do painel: os diálogos (paleta, detalhe no celular) montam DENTRO dele para herdar o tema e os
 * tokens, em vez de cair direto no `body`.
 */
export const PanelRoot = createContext<HTMLElement | null>(null);

export const usePanelRoot = () => useContext(PanelRoot);
