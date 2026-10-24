'use client';

import { useSyncExternalStore } from 'react';
import type { CharmPick, FrameId } from './catalog';

/**
 * A escolha da Conta de exemplo (lia.exe) no protótipo: moldura, chaveiro e o plano simulado (Grátis
 * ou VIP, só para a tela de escolha mostrar os cadeados). Vive no localStorage e avisa quem escuta,
 * então o Perfil, o pódio, o trilho e o header mudam juntos com a tela de escolha.
 */
export type CosmeticState = {
  frame: FrameId | null;
  charm: CharmPick | null;
  plan: 'free' | 'vip';
  /** Já gravou o chaveiro padrão (não reescreve se a pessoa escolheu "sem chaveiro"). */
  seeded: boolean;
};

const KEY = 'vida-cosmeticos';
const DEFAULTS: CosmeticState = { frame: 'doppler', charm: null, plan: 'vip', seeded: false };

let current: CosmeticState = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load(): CosmeticState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CosmeticState>) };
  } catch {
    // sem armazenamento ou JSON ruim: valem os padrões
  }
  return DEFAULTS;
}

function snapshot(): CosmeticState {
  if (!loaded && typeof window !== 'undefined') {
    current = load();
    loaded = true;
  }
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    current = load();
    for (const notify of listeners) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function setCosmetics(patch: Partial<CosmeticState>) {
  current = { ...snapshot(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // vale só nesta página
  }
  for (const notify of listeners) notify();
}

/** A escolha atual (no servidor e na hidratação, os padrões; depois, o que está guardado). */
export function useCosmeticState(): CosmeticState {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);
}
