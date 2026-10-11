import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeftIcon } from '@/components/icons/animated/arrow-left';
import { AnimatedIcon } from '@/components/icons/animated-icon';

/** Volta um nível (Item → Inventário), discreto acima do título. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href as Route}
      className="-ml-2 inline-flex min-h-8 items-center gap-1.5 justify-self-start rounded-md px-2 text-[13px] font-medium tracking-normal text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground max-md:min-h-(--tap)"
    >
      <AnimatedIcon icon={ArrowLeftIcon} size={15} />
      {children}
    </Link>
  );
}
