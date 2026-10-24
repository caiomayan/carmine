'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { STATES } from './data';
import { applyHeaderMode, type HeaderMode, readHeaderMode } from './pill-header';

const PROFILE_STATES = [
  { id: 'completo', label: 'Perfil completo' },
  { id: 'novo', label: 'Conta nova (vazio)' },
  { id: 'privado', label: 'Perfil privado' },
  { id: 'nao-reivindicado', label: 'Conta não reivindicada' },
];

/**
 * Barra do protótipo (só nas rotas /proto): troca de tela (Home, Perfil, Configurações), de estado e do
 * modo do header (pílula flutuante ou normal), para o dono comparar. Fica fora das capturas com `?dock=0`.
 */
export function ProtoBar() {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [header, setHeader] = useState<HeaderMode>('pill');
  useEffect(() => setHeader(readHeaderMode()), []);
  if (params.get('dock') === '0') return null;

  const onProfile = path.startsWith('/proto/perfil');
  const estado = params.get('estado');
  const states = onProfile ? PROFILE_STATES : STATES;
  const keep = params.get('dock') ? '' : '';
  const seg = (active: boolean) =>
    cn(
      'inline-flex min-h-8 items-center rounded-full px-3.5 text-[12px] font-bold tracking-[0.1em] whitespace-nowrap uppercase transition-colors duration-(--dur-fast) max-md:min-h-(--tap)',
      active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-(--fill-hover)',
    );

  return (
    <nav
      aria-label="Protótipo"
      data-testid="proto-bar"
      className="v-dock fixed inset-x-3 bottom-3 z-60 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-full bg-(--raised) p-1.5 text-foreground shadow-(--shadow-overlay)"
    >
      <span className="px-2 text-[10px] font-bold tracking-[0.16em] text-faint uppercase max-md:hidden">
        Protótipo
      </span>
      <Link href={'/proto' as Route} className={seg(path === '/proto')}>
        Home
      </Link>
      <Link href={'/proto/perfil' as Route} className={seg(onProfile)}>
        Perfil
      </Link>
      <Link href={'/proto/ranking' as Route} className={seg(path.startsWith('/proto/ranking'))}>
        Ranking
      </Link>
      <Link href={'/proto/cosmeticos' as Route} className={seg(path.startsWith('/proto/cosmeticos'))}>
        Cosméticos
      </Link>
      <Link href={'/configuracoes/aparencia' as Route} className={seg(false)}>
        Configurações
      </Link>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
      <label className="flex items-center">
        <span className="sr-only">Estado da tela</span>
        <select
          value={estado ?? states[0]?.id}
          onChange={(e) => router.push(`${path}?estado=${e.target.value}${keep}` as Route)}
          className="min-h-8 rounded-full bg-(--fill-rest) px-3 text-caption font-semibold text-foreground max-md:min-h-(--tap)"
        >
          {states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
      <button
        type="button"
        aria-pressed={header === 'pill'}
        onClick={() => {
          const next: HeaderMode = header === 'pill' ? 'normal' : 'pill';
          setHeader(next);
          applyHeaderMode(next);
        }}
        className={seg(false)}
      >
        Header: {header === 'pill' ? 'pílula' : 'normal'}
      </button>
    </nav>
  );
}
