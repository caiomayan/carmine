import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { BoxIcon } from '@/components/icons/animated/box';
import { Button } from '@/components/ui/button';

/**
 * O Perfil de quem ainda não equipou nada nem jogou: um bloco só, no lugar das duas caixas vazias
 * (Loadout e Estatísticas). O dono tem o caminho para montar o Loadout; o visitante, só o aviso.
 */
export async function ProfileEmpty({ name, isOwner }: { name: string; isOwner: boolean }) {
  const t = await getTranslations('profile.empty');

  return (
    <div
      className="mt-8 animate-fade-up rounded-xl bg-surface [animation-delay:80ms]"
      data-testid="profile-empty"
    >
      <EmptyState
        icon={BoxIcon}
        title={t('title')}
        body={isOwner ? t('owner') : t('visitor', { name })}
        action={
          isOwner ? (
            <Button asChild>
              <Link href="/loadout">{t('action')}</Link>
            </Button>
          ) : null
        }
      />
    </div>
  );
}
