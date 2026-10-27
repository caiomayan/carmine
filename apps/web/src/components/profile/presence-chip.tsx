'use client';

import type { ProfilePlaying } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ConnectHelp, CopyGlyph, useConnect } from '@/components/servers/connect';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { parseProfilePlaying } from '@/lib/api-guards';
import { steamConnectUrl } from '@/lib/live-servers';

/** Releitura da presença com a página aberta: o batimento do jogo muda a cada 10 s. */
const REFRESH_MS = 20_000;

type PlayingServer = NonNullable<ProfilePlaying['server']>;

/**
 * Onde a Conta do Perfil está jogando. A presença é pública (também no Perfil privado), então a
 * leitura não depende de sessão. Fica `null` até saber e se a resposta falhar: sem resposta boa
 * não se sabe onde a pessoa está, e a marca some em vez de ficar velha.
 */
function usePlaying(publicId: number): PlayingServer | null {
  const [server, setServer] = useState<PlayingServer | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch(`/api/profiles/${publicId}/playing`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = response.ok ? parseProfilePlaying(await response.json()) : null;
        setServer(data?.server ?? null);
      } catch {
        if (!controller.signal.aborted) setServer(null);
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [publicId]);

  return server;
}

/**
 * "Jogando agora" no Perfil: pontinho verde e o chip com o Servidor Carmine. Quem visita (`join`)
 * também ganha o "Entrar junto", que abre o `steam://connect` do mesmo servidor com a instrução do
 * console logo abaixo; o dono não precisa entrar no servidor em que já está. Some quando a Conta
 * não está num servidor.
 */
export function PresenceChip({
  publicId,
  label,
  join,
}: {
  publicId: number;
  label: string;
  join?: { label: string; aria: string };
}) {
  const server = usePlaying(publicId);
  return server ? <PlayingNow server={server} label={label} join={join} /> : null;
}

function PlayingNow({
  server,
  label,
  join,
}: {
  server: PlayingServer;
  label: string;
  join?: { label: string; aria: string };
}) {
  const t = useTranslations('servers');
  const connect = useConnect(server);
  const copied = connect.copyStatus === 'copied';
  return (
    <>
      <span
        data-testid="presence-chip"
        className="inline-flex animate-fade-up items-center gap-2 rounded-full bg-(--fill-rest) px-3 py-1.5"
      >
        <StatusDot tone="online" pulse />
        {label}
        <span className="font-normal text-muted-foreground">
          {server.showcaseName ?? server.name}
          {server.map ? ` · ${server.map}` : ''}
        </span>
      </span>
      {join ? (
        <>
          <Button
            asChild
            size="sm"
            variant={server.state === 'full' ? 'ghost' : 'primary'}
            className="animate-fade-up pointer-coarse:hidden"
          >
            <a
              href={steamConnectUrl(server.address)}
              aria-label={join.aria}
              aria-describedby={connect.help !== 'closed' ? connect.helpId : undefined}
              onClick={connect.opening}
              data-testid="join-together"
            >
              {join.label}
            </a>
          </Button>
          {/* No celular não há CS2: só o IP para copiar. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={connect.copyAddress}
            className="hidden animate-fade-up pointer-coarse:inline-flex"
          >
            <CopyGlyph copied={copied} />
            {copied ? t('connect.copied') : t('connect.copy')}
          </Button>
          <div className="basis-full">
            <ConnectHelp server={server} connect={connect} showFullHint />
          </div>
        </>
      ) : null}
    </>
  );
}
