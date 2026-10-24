'use client';

import { useEffect } from 'react';
import { useNowPlaying } from '@/components/session/use-now-playing';
import { StatusDot } from '@/components/status-dot';

/** Releitura da presença com a página aberta: o batimento do jogo muda a cada 10 s. */
const REFRESH_MS = 20_000;

/**
 * "Jogando agora" no Perfil da própria Conta: pontinho verde e o chip com o Servidor Carmine. A API só diz
 * onde a Conta da sessão está (`/api/me/playing`), então esta marca existe no Perfil do dono; a dos outros
 * jogadores espera uma consulta pública de presença. Some quando a Conta não está num servidor.
 */
export function PresenceChip({ label }: { label: string }) {
  const { server, load } = useNowPlaying();

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (!server) return null;
  return (
    <span
      data-testid="presence-chip"
      className="inline-flex items-center gap-2 rounded-full bg-(--fill-rest) px-3 py-1.5"
    >
      <StatusDot tone="online" pulse />
      {label}
      <span className="font-normal text-muted-foreground">
        {server.showcaseName ?? server.name}
        {server.map ? ` · ${server.map}` : ''}
      </span>
    </span>
  );
}
