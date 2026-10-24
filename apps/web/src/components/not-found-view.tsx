import Link from 'next/link';
import { ArrowLeftIcon } from '@/components/icons/animated/arrow-left';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';

/**
 * O 404 da Liberty (geral e de Perfil): alinhado ao container como as outras páginas, com o
 * código no eyebrow (◆ ERRO 404) acima do título em DM Serif, e o botão sozinho na linha de baixo.
 */
export function NotFoundView({
  code,
  title,
  body,
  back,
}: {
  code: string;
  title: string;
  body: string;
  back: string;
}) {
  return (
    <div className="container-page animate-fade-up pt-16 pb-24 max-md:pt-10 max-md:pb-16">
      <div className="grid max-w-[640px] justify-items-start gap-4">
        <p className="v-sign text-[20px] tracking-[0.14em] text-muted-foreground">St. Carmine</p>
        <p className="inline-flex items-center gap-2.5 label-caps text-foreground">
          <span aria-hidden="true" className="size-1.5 rotate-45 bg-foreground" />
          {code}
        </p>
        <h1 className="font-display text-[64px] leading-[1.04] font-normal tracking-[-0.015em] text-balance max-md:text-[40px]">
          {title}
        </h1>
        <p className="max-w-[48ch] text-md text-muted-foreground">{body}</p>
        <Button asChild className="mt-3">
          <Link href="/">
            <AnimatedIcon icon={ArrowLeftIcon} size={16} />
            {back}
          </Link>
        </Button>
      </div>
    </div>
  );
}
