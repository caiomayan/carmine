import { cn } from '@/lib/utils';
import './home.css';

const bone = 'vh-skel rounded-md';

/**
 * O esqueleto da Home (estado "carregando"): a mesma grade, com a varredura de brilho. Aparece enquanto a lista de
 * servidores ainda não chegou; o texto de verdade fica para o leitor de tela.
 */
export function HomeSkeleton({ label }: { label: string }) {
  return (
    <div data-vida="on" data-state="carregando" data-testid="home-skeleton" aria-busy="true">
      <div aria-hidden="true" className="v-ambient">
        <i />
        <i />
        <i />
      </div>
      <p className="sr-only" role="status">
        {label}
      </p>
      <div className="container-page pb-24">
        <div className="grid gap-x-10 gap-y-10 min-[1280px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 pt-12 max-md:pt-8">
            <div aria-hidden="true" className={cn(bone, 'h-5 w-52 rounded-full')} />
            <div className={cn(bone, 'mt-5 h-[clamp(96px,14vw,190px)] w-[min(520px,90%)]')} />
            <div className={cn(bone, 'mt-6 h-5 w-[min(460px,86%)]')} />
            <div className="mt-7 flex gap-3">
              <div className={cn(bone, 'h-11 w-44 rounded-full')} />
              <div className={cn(bone, 'h-11 w-40 rounded-full')} />
            </div>
            <div className="mt-12 grid gap-4 min-[760px]:grid-cols-2">
              <div className={cn(bone, 'h-[300px] rounded-2xl')} />
              <div className={cn(bone, 'h-[300px] rounded-2xl')} />
              <div className={cn(bone, 'h-[230px] rounded-2xl')} />
              <div className={cn(bone, 'h-[230px] rounded-2xl')} />
            </div>
          </div>
          <div className="grid content-start gap-4 max-[1279px]:hidden min-[1280px]:pt-14">
            {[210, 300, 200].map((height) => (
              <div key={height} className={cn(bone, 'rounded-2xl')} style={{ height }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** O esqueleto da vitrine dos Loadouts (enquanto o chunk e os dados chegam). */
export function LoadoutsSkeleton() {
  return (
    <div aria-hidden="true" className="mt-4 py-12">
      <div className={cn(bone, 'mb-6 h-4 w-52')} />
      <div className="grid gap-5 min-[1000px]:grid-cols-[1.25fr_1fr]">
        <div className={cn(bone, 'h-[420px] rounded-2xl')} />
        <div className="grid grid-cols-2 gap-2.5 max-[999px]:hidden">
          {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => (
            <div key={id} className={cn(bone, 'h-[150px] rounded-xl')} />
          ))}
        </div>
      </div>
    </div>
  );
}
