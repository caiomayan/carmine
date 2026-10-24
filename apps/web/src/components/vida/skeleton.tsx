import { cn } from '@/lib/utils';

const bone = 'v-skel rounded-md';

/** Esqueleto da Home: a mesma grade, com a varredura de brilho na cor da marca da direção. */
export function HomeSkeleton() {
  return (
    <div data-vida="on" data-state="carregando" aria-busy="true">
      <div aria-hidden="true" className="v-ambient">
        <i />
        <i />
        <i />
      </div>
      <p className="sr-only" role="status">
        Carregando os servidores
      </p>
      <div className="container-page pb-24">
        <div className="grid gap-x-10 gap-y-10 min-[1280px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 pt-12 max-md:pt-8">
            <p aria-hidden="true" className="v-sign v-shine text-[28px] tracking-[0.12em]">St. Carmine</p>
            <p aria-hidden="true" className="v-label mt-2 text-muted-foreground">Carregando</p>
            <div className={cn(bone, 'mt-5 h-[clamp(96px,14vw,190px)] w-[min(520px,90%)]')} />
            <div className={cn(bone, 'mt-6 h-5 w-[min(460px,86%)]')} />
            <div className="mt-7 flex gap-3">
              <div className={cn(bone, 'h-11 w-44')} />
              <div className={cn(bone, 'h-11 w-40')} />
            </div>
            <div className="mt-12 grid gap-4 min-[760px]:grid-cols-2">
              <div className={cn(bone, 'h-[300px] rounded-xl')} />
              <div className={cn(bone, 'h-[300px] rounded-xl')} />
              <div className={cn(bone, 'h-[230px] rounded-xl')} />
              <div className={cn(bone, 'h-[230px] rounded-xl')} />
            </div>
          </div>
          <div className="grid content-start gap-4 min-[1280px]:pt-14">
            {[210, 300, 200].map((h) => (
              <div key={h} className={cn(bone, 'rounded-xl')} style={{ height: h }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoadoutsSkeleton() {
  return (
    <div aria-hidden="true" className="mt-4 py-12">
      <div className={cn(bone, 'mb-6 h-4 w-52')} />
      <div className="grid gap-5 min-[1000px]:grid-cols-[1.25fr_1fr]">
        <div className={cn(bone, 'h-[420px] rounded-xl')} />
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={cn(bone, 'h-[150px] rounded-xl')} />
          ))}
        </div>
      </div>
    </div>
  );
}
