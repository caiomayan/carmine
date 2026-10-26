'use client';

import type { LoadoutSide } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/animate-ui/components/radix/sheet';
import type { CandidateView, SlotView } from '@/lib/loadout/view';
import { cn } from '@/lib/utils';
import { SlotPicker } from './slot-picker';

/**
 * A folha com o Inventário para trocar o Item do slot selecionado. Só existe depois do primeiro clique em
 * "Trocar" (o Loadout a carrega com `dynamic()`, e o ponteiro sobre o quadro já a busca): quem só olha o
 * quadro não baixa a folha nem o seletor (orçamento de JS).
 */
export function PickerSheet({
  mode,
  onClose,
  onDone,
  slot,
  title,
  otherSide,
  equippedSides,
  candidates,
  catalogHref,
  rarityLabels,
  names,
}: {
  /** De onde a folha abre: da direita (tela larga) ou de baixo (celular); `closed` a fecha. */
  mode: 'closed' | 'right' | 'bottom';
  onClose: () => void;
  onDone: () => void;
  slot: SlotView | undefined;
  /** O nome do slot com o lado, como o título da folha. */
  title: string;
  otherSide: LoadoutSide | null;
  equippedSides: LoadoutSide[];
  candidates: CandidateView[];
  catalogHref: string;
  rarityLabels: Record<string, string>;
  names: (uid: string) => string | undefined;
}) {
  const t = useTranslations('loadout');
  const tc = useTranslations('common');
  return (
    <Sheet open={mode !== 'closed'} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={mode === 'bottom' ? 'bottom' : 'right'}
        closeLabel={tc('close')}
        className={cn(
          'overflow-y-auto',
          mode === 'bottom'
            ? 'h-auto max-h-[88dvh] rounded-t-xl pb-[max(20px,env(safe-area-inset-bottom))]'
            : 'w-[min(420px,100%-48px)]',
        )}
      >
        {slot ? (
          <>
            <SheetHeader className="pr-14">
              <SheetTitle>{t('panel.pickerTitle', { slot: title })}</SheetTitle>
              <SheetDescription>{t('panel.pickerDescription')}</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">
              <SlotPicker
                key={slot.key}
                slot={slot}
                otherSide={otherSide}
                equippedSides={equippedSides}
                candidates={candidates}
                catalogHref={catalogHref}
                rarityLabels={rarityLabels}
                names={names}
                onDone={onDone}
              />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
