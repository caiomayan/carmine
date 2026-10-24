'use client';

import { useState } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/animate-ui/components/radix/tabs';
import { cn } from '@/lib/utils';
import { type CharmPick, EARNED, FRAMES, type FrameId, type FrameInfo } from './catalog';
import { CosmeticAvatar } from './cosmetic-avatar';
import { setCosmetics, useCosmeticState } from './store';

const TIER_LABEL = { free: 'Grátis', earned: 'Conquistada', vip: 'VIP' } as const;

function Lock({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={cn('size-3.5', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="7" width="10" height="7" rx="2" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

/**
 * A tela de escolha dos cosméticos do Perfil (protótipo): abas Molduras e Chaveiro, prévia ao vivo do
 * avatar nos tamanhos em que ele aparece no site, e cadeado nas molduras que a Conta ainda não tem.
 * "Equipar" grava no navegador (store.ts) e o Perfil, o pódio, o trilho e o header mudam junto.
 */
export function CosmeticsPicker({ charms }: { charms: readonly CharmPick[] }) {
  const state = useCosmeticState();
  const [tab, setTab] = useState('molduras');
  // undefined = mostra o que está equipado; null = "sem"; valor = prévia ainda não equipada.
  const [frameDraft, setFrameDraft] = useState<FrameId | null | undefined>(undefined);
  const [charmDraft, setCharmDraft] = useState<CharmPick | null | undefined>(undefined);
  const vip = state.plan === 'vip';

  const shownFrame = frameDraft === undefined ? state.frame : frameDraft;
  const shownCharm = charmDraft === undefined ? state.charm : charmDraft;

  const lockOf = (frame: FrameInfo): string | null => {
    if (frame.tier === 'vip' && !vip) return 'Exclusivo do VIP';
    if (frame.tier === 'earned' && !EARNED.includes(frame.id)) return frame.unlock ?? 'Conquista';
    return null;
  };
  const shownInfo = FRAMES.find((frame) => frame.id === shownFrame);
  const shownLock = shownInfo ? lockOf(shownInfo) : null;
  const frameChanged = frameDraft !== undefined && frameDraft !== state.frame;
  const charmChanged = charmDraft !== undefined && charmDraft?.id !== state.charm?.id;
  const combo = { frame: shownFrame, charm: shownCharm, vip };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-24">
        <section
          aria-label="Prévia ao vivo"
          data-testid="cosmetics-preview"
          className="v-panel v-panel-lg cos-stage grid justify-items-center gap-5 p-6"
        >
          <p className="label-caps self-start text-foreground">Prévia ao vivo</p>
          <div data-cos-host className="grid justify-items-center gap-3 pt-6 pb-8">
            <CosmeticAvatar
              person="lia"
              name="lia.exe"
              hue={330}
              size={168}
              live
              anim="always"
              cosmetics={combo}
              className="mt-10 mr-10 mb-20 ml-10"
              faceClassName="text-[64px]!"
            />
            <p className="v-serif text-[34px]">lia.exe</p>
            <span className="v-chip-live">Jogando · Retake em Mirage</span>
          </div>
          <div className="grid w-full gap-2">
            <p className="text-caption font-semibold text-muted-foreground">
              Como aparece no site (passe o mouse)
            </p>
            <ul className="flex flex-wrap items-start justify-around gap-x-4 gap-y-6 rounded-2xl bg-(--fill-rest) px-4 pt-6 pb-8">
              {[28, 40, 64, 84].map((size) => (
                <li key={size} data-cos-host className="grid justify-items-center gap-3">
                  <CosmeticAvatar
                    person="lia"
                    name="lia.exe"
                    hue={330}
                    size={size}
                    cosmetics={combo}
                    className="mx-2"
                  />
                  <span
                    className="pt-[0.6em] text-[10px] font-semibold text-faint tabular-nums"
                    style={{ marginTop: size * 0.32 }}
                  >
                    {size}px
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid w-full gap-2">
            {shownLock ? (
              <p
                data-testid="cosmetics-lock-note"
                className="inline-flex items-center gap-2 rounded-xl bg-status-vip/15 px-3.5 py-2.5 text-body-sm"
              >
                <Lock className="shrink-0 text-status-vip" />
                {shownLock}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="v-cta v-pill min-h-10! flex-1 disabled:pointer-events-none disabled:opacity-40"
                disabled={(!frameChanged && !charmChanged) || (frameChanged && !!shownLock)}
                onClick={() => {
                  const patch: Parameters<typeof setCosmetics>[0] = {};
                  if (frameChanged) patch.frame = frameDraft ?? null;
                  if (charmChanged) patch.charm = charmDraft ?? null;
                  setCosmetics(patch);
                  setFrameDraft(undefined);
                  setCharmDraft(undefined);
                }}
                data-testid="cosmetics-equip"
              >
                Equipar
              </button>
              <button
                type="button"
                className="v-cta-quiet v-pill min-h-10! disabled:pointer-events-none disabled:opacity-40"
                disabled={!frameChanged && !charmChanged}
                onClick={() => {
                  setFrameDraft(undefined);
                  setCharmDraft(undefined);
                }}
              >
                Desfazer
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Cosméticos" className="w-fit">
              <TabsTrigger value="molduras" data-testid="tab-molduras">
                Molduras
              </TabsTrigger>
              <TabsTrigger value="chaveiro" data-testid="tab-chaveiro">
                Chaveiro
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <fieldset className="m-0 inline-flex items-center gap-1 rounded-full border-0 bg-(--fill-rest) p-1">
            <legend className="sr-only">Plano simulado</legend>
            {(['free', 'vip'] as const).map((plan) => (
              <button
                key={plan}
                type="button"
                aria-pressed={state.plan === plan}
                onClick={() => setCosmetics({ plan })}
                className={cn(
                  'min-h-8 rounded-full px-3.5 text-[12px] font-bold tracking-[0.08em] uppercase transition-colors duration-(--dur-fast)',
                  state.plan === plan
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-(--fill-hover)',
                )}
              >
                {plan === 'free' ? 'Plano grátis' : 'VIP'}
              </button>
            ))}
          </fieldset>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsContent value="molduras" className="mt-0">
            <ul
              className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 xl:grid-cols-4"
              data-testid="frame-grid"
            >
              <li>
                <button
                  type="button"
                  aria-pressed={shownFrame === null}
                  onClick={() => setFrameDraft(null)}
                  className={cn(
                    'v-panel grid h-full w-full content-start justify-items-center gap-2 p-4 text-center transition-colors duration-(--dur-fast) hover:bg-(--fill-hover)',
                    shownFrame === null && 'bg-(--fill-active)!',
                  )}
                >
                  <span className="grid size-[108px] place-items-center">
                    <CosmeticAvatar
                      person="lia"
                      name="lia.exe"
                      hue={330}
                      size={64}
                      cosmetics={{ frame: null, charm: null }}
                    />
                  </span>
                  <span className="text-body-sm font-semibold">Sem moldura</span>
                  <span className="text-caption text-muted-foreground">Só o avatar.</span>
                </button>
              </li>
              {FRAMES.map((frame) => {
                const lock = lockOf(frame);
                const equipped = state.frame === frame.id;
                return (
                  <li key={frame.id}>
                    <button
                      type="button"
                      data-cos-host
                      data-testid={`frame-${frame.id}`}
                      data-locked={lock ? 'true' : undefined}
                      aria-pressed={shownFrame === frame.id}
                      onClick={() => setFrameDraft(frame.id)}
                      className={cn(
                        'v-panel grid h-full w-full content-start justify-items-center gap-2 p-4 text-center transition-colors duration-(--dur-fast) hover:bg-(--fill-hover)',
                        shownFrame === frame.id && 'bg-(--fill-active)!',
                      )}
                    >
                      <span className="grid size-[108px] place-items-center">
                        <CosmeticAvatar
                          person="lia"
                          name="lia.exe"
                          hue={330}
                          size={64}
                          cosmetics={{ frame: frame.id, charm: null }}
                          className={cn(lock && 'opacity-70')}
                        />
                      </span>
                      <span className="flex items-center gap-1.5 text-body-sm font-semibold">
                        {lock ? <Lock className="text-status-vip" /> : null}
                        {frame.name}
                      </span>
                      <span className="text-caption text-muted-foreground">{frame.blurb}</span>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-[10.5px] font-bold tracking-[0.08em] uppercase',
                          frame.tier === 'vip'
                            ? 'bg-status-vip/20 text-foreground'
                            : 'bg-(--fill-rest) text-muted-foreground',
                        )}
                      >
                        {equipped ? 'Equipada' : TIER_LABEL[frame.tier]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          <TabsContent value="chaveiro" className="mt-0">
            <p className="pb-3 text-body-sm text-muted-foreground">
              Os chaveiros do seu Inventário. O escolhido pende da borda do avatar e balança quando
              o mouse passa.
              {vip
                ? ' Com VIP o balanço é mais solto e ele ganha brilho.'
                : ' O VIP dá um balanço mais solto e brilho.'}
            </p>
            <ul
              className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 xl:grid-cols-4"
              data-testid="charm-grid"
            >
              <li>
                <button
                  type="button"
                  aria-pressed={shownCharm === null}
                  onClick={() => setCharmDraft(null)}
                  className={cn(
                    'v-panel grid h-full w-full content-start justify-items-center gap-2 p-4 text-center transition-colors duration-(--dur-fast) hover:bg-(--fill-hover)',
                    shownCharm === null && 'bg-(--fill-active)!',
                  )}
                >
                  <span className="grid size-16 place-items-center rounded-full bg-(--fill-rest) text-faint">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className="size-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    >
                      <path d="m3 3 10 10M13 3 3 13" />
                    </svg>
                  </span>
                  <span className="text-body-sm font-semibold">Sem chaveiro</span>
                </button>
              </li>
              {charms.map((charm) => (
                <li key={charm.id}>
                  <button
                    type="button"
                    data-testid={`charm-${charm.id}`}
                    aria-pressed={shownCharm?.id === charm.id}
                    onClick={() => setCharmDraft(charm)}
                    className={cn(
                      'v-panel grid h-full w-full content-start justify-items-center gap-2 p-4 text-center transition-colors duration-(--dur-fast) hover:bg-(--fill-hover)',
                      shownCharm?.id === charm.id && 'bg-(--fill-active)!',
                    )}
                  >
                    {/* biome-ignore lint/performance/noImgElement: imagem do catálogo, pequena e externa. */}
                    <img
                      src={charm.image}
                      alt=""
                      width={72}
                      height={72}
                      loading="lazy"
                      className="size-[72px] object-contain"
                    />
                    <span className="line-clamp-2 text-body-sm font-semibold">{charm.name}</span>
                    {state.charm?.id === charm.id ? (
                      <span className="rounded-full bg-(--fill-rest) px-2.5 py-0.5 text-[10.5px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                        Equipado
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
