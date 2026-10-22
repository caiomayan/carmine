'use client';

import { HistoryIcon } from '@/components/icons/animated/history';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';

/** Aviso de que o editor voltou com um rascunho guardado antes da sessão expirar. */
export function DraftNotice({
  labels,
  onDiscard,
}: {
  labels: { restored: string; discard: string };
  onDiscard: () => void;
}) {
  return (
    <div
      role="status"
      data-icon-trigger
      data-testid="draft-restored"
      className="flex animate-fade-up flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface py-2 pr-2 pl-4 text-body-sm"
    >
      <AnimatedIcon icon={HistoryIcon} size={16} className="text-status-info" />
      <p className="min-w-0 flex-1">{labels.restored}</p>
      <Button type="button" variant="quiet" size="sm" onClick={onDiscard}>
        {labels.discard}
      </Button>
    </div>
  );
}
