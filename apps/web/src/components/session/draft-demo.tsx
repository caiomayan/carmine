'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LabelInput } from '@/components/ui/label-input';
import { signInHref } from '@/lib/auth-links';
import { DraftNotice } from './draft-notice';
import { useSession } from './session-provider';
import { useDraft } from './use-draft';

export type DraftDemoLabels = {
  field: string;
  save: string;
  saved: string;
  signInFirst: string;
  restored: string;
  discard: string;
};

/**
 * Editor mínimo para exercitar o rascunho local (S03) até o editor de Item da S04 existir.
 * "Salvar" confere a sessão com `GET /api/me` pelo mesmo caminho das mutações: com a sessão
 * expirada, a pessoa vai para entrar e volta aqui com o rascunho.
 */
export function DraftDemo({ labels }: { labels: DraftDemoLabels }) {
  const { status, mutate } = useSession();
  const pathname = usePathname();
  const draft = useDraft('dev-rascunho', { nametag: '' });
  const [saved, setSaved] = useState(false);
  const id = useId();

  if (status !== 'authenticated') {
    return (
      <p className="text-md text-muted-foreground">
        <Link href={signInHref(pathname) as Route} className="underline underline-offset-4">
          {labels.signInFirst}
        </Link>
      </p>
    );
  }

  return (
    <form
      className="grid max-w-[420px] gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        draft.persist();
        const response = await mutate('/api/me');
        if (response.ok) {
          draft.commit();
          setSaved(true);
        }
      }}
    >
      {draft.restored ? <DraftNotice labels={labels} onDiscard={draft.discard} /> : null}
      <LabelInput
        id={id}
        label={labels.field}
        value={draft.value.nametag}
        onChange={(event) => {
          setSaved(false);
          draft.set({ nametag: event.target.value });
        }}
      />
      <div className="flex items-center gap-3">
        <Button type="submit">{labels.save}</Button>
        <p role="status" className="text-sm text-muted-foreground">
          {saved ? labels.saved : null}
        </p>
      </div>
    </form>
  );
}
