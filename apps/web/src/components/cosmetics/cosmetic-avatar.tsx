'use client';

import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { Face } from '@/components/vida/face';
import { cn } from '@/lib/utils';
import { type CharmPick, type Cosmetics, FRAME_BY_ID, type FrameId } from './catalog';
import { Charm } from './charm';
import { FrameArt } from './frames';
import { setCosmetics, useCosmeticState } from './store';

/**
 * As pessoas de exemplo e o que cada uma usa (a lia.exe, a Conta logada do protótipo, usa o que a
 * tela de escolha gravar). `charm` é o índice na lista de chaveiros do Inventário (ver o provider).
 */
const DEMO: Record<string, { frame: FrameId | null; charm: number | null }> = {
  kuririn: { frame: 'ouro', charm: 2 },
  dudu: { frame: 'molotov', charm: 5 },
  nathy: { frame: 'fumaca', charm: null },
  duda: { frame: 'c4', charm: 7 },
  ze: { frame: 'fundador', charm: 4 },
  mafalda: { frame: 'aco', charm: null },
  cacau: { frame: 'grafite', charm: 9 },
  jao: { frame: 'doppler', charm: null },
  noite: { frame: 'aco', charm: 3 },
};

const CharmsContext = createContext<readonly CharmPick[]>([]);

/** Os chaveiros do Inventário da Conta de exemplo (vêm do catálogo, no servidor). */
export function CosmeticsProvider({
  charms,
  children,
}: {
  charms: readonly CharmPick[];
  children: ReactNode;
}) {
  // A Conta de exemplo começa com um chaveiro (uma vez); depois vale a escolha, inclusive "sem".
  const state = useCosmeticState();
  useEffect(() => {
    if (!state.seeded && charms[0]) setCosmetics({ charm: charms[2] ?? charms[0], seeded: true });
  }, [charms, state.seeded]);
  return <CharmsContext value={charms}>{children}</CharmsContext>;
}

export function useCharms(): readonly CharmPick[] {
  return useContext(CharmsContext);
}

/** O que esta pessoa usa: a lia.exe lê o que foi escolhido; as outras têm a combinação fixa. */
export function useCosmeticsOf(person: string): Cosmetics & { vip: boolean } {
  const state = useCosmeticState();
  const charms = useCharms();
  if (person === 'lia')
    return { frame: state.frame, charm: state.charm, vip: state.plan === 'vip' };
  const demo = DEMO[person];
  const frame = demo?.frame ?? null;
  return {
    frame,
    charm: demo?.charm != null ? (charms[demo.charm] ?? null) : null,
    vip: frame ? FRAME_BY_ID[frame].tier === 'vip' : false,
  };
}

/**
 * O avatar com moldura e chaveiro. A moldura passa da borda; o chaveiro pende de um ponto da borda; o
 * "jogando agora" é um pontinho no canto (o chip com o texto fica ao lado do nome, na tela que usa).
 * `anim`: "always" anima sempre (o Perfil); "hover" só no hover do avatar ou da linha com
 * `data-cos-host` (as listas). O tamanho do avatar é `size`; a moldura e o chaveiro saem dele.
 */
export function CosmeticAvatar({
  person,
  name,
  hue,
  size,
  live = false,
  anim = 'hover',
  className,
  faceClassName,
  cosmetics,
}: {
  person: string;
  name: string;
  hue: number;
  size: number;
  live?: boolean;
  anim?: 'always' | 'hover';
  className?: string;
  faceClassName?: string;
  /** Força a combinação (a prévia da tela de escolha); sem isso vale a da pessoa. */
  cosmetics?: Cosmetics & { vip?: boolean };
}) {
  const own = useCosmeticsOf(person);
  const { frame, charm } = cosmetics ?? own;
  const vip = cosmetics?.vip ?? own.vip;
  const host = useRef<HTMLSpanElement>(null);
  // O pontinho fica no canto de cima à direita: fora da moldura (raio 39/32 do avatar) ou na borda dele.
  // Em % da caixa do avatar, para acompanhar o tamanho quando o CSS o muda (celular).
  const reach = 50 * (frame ? 39 / 32 : 1);
  const dotAt = {
    left: `${Math.round((50 + reach * Math.cos(Math.PI / 4)) * 100) / 100}%`,
    top: `${Math.round((50 - reach * Math.sin(Math.PI / 4)) * 100) / 100}%`,
  };

  return (
    <span
      ref={host}
      className={cn('cos', className)}
      data-anim={anim}
      data-frame={frame ?? undefined}
      style={{ width: size, height: size }}
    >
      <Face name={name} hue={hue} size={size} dot={false} className={faceClassName} />
      {frame ? <FrameArt frame={frame} /> : null}
      {charm ? <Charm pick={charm} rich={vip} idle={anim === 'always'} hostRef={host} /> : null}
      {live ? (
        <>
          <span
            aria-hidden="true"
            className="cos-live"
            style={{ ...dotAt, width: 'max(9px, 22%)', aspectRatio: '1' }}
          />
          <span className="sr-only">Jogando agora</span>
        </>
      ) : null}
    </span>
  );
}
