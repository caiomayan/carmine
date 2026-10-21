'use client';

import type { LiveServer } from '@carmine/contracts';
import { AnimatePresence, m } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/animate-ui/components/radix/tooltip';
import { CheckIcon } from '@/components/icons/animated/check';
import { CopyIcon } from '@/components/icons/animated/copy';
import { XIcon } from '@/components/icons/animated/x';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { serverFullLabel, steamConnectUrl } from '@/lib/live-servers';
import { cn } from '@/lib/utils';
import { type CopyStatus, useCopy } from './use-copy';

/** Trecho de comando de console, no mesmo desenho do `!ws` do Loadout. */
export const cmd = (chunks: ReactNode) => (
  <code className="rounded-sm bg-surface-2 px-1 py-px font-semibold whitespace-nowrap text-foreground">
    {chunks}
  </code>
);

type Help = 'closed' | 'connect' | 'copy';

/**
 * Jogar num servidor: abre o `steam://connect` e, logo abaixo, a instrução do console com o IP
 * copiável (para quando o `steam://` não abre). A linha e o cartão usam o mesmo comportamento.
 */
export function useConnect(server: LiveServer) {
  const [help, setHelp] = useState<Help>('closed');
  const { status: copyStatus, copy } = useCopy();
  const helpId = useId();
  const copyAddress = async () => {
    await copy(server.address);
    setHelp((current) => (current === 'closed' ? 'copy' : current));
  };
  return {
    help,
    helpId,
    copyStatus,
    copyAddress,
    opening: () => setHelp('connect'),
    close: () => setHelp('closed'),
  };
}

export type Connect = ReturnType<typeof useConnect>;

export function CopyGlyph({ copied }: { copied: boolean }) {
  return copied ? (
    <span className="text-status-success">
      <AnimatedIcon icon={CheckIcon} size={16} />
    </span>
  ) : (
    <AnimatedIcon icon={CopyIcon} size={16} />
  );
}

/**
 * Os botões de um servidor no ar: Jogar e copiar o IP. Num aparelho de toque não há CS2: só o
 * IP para copiar, com o texto dizendo o que faz. Num servidor lotado, Jogar perde o preenchido
 * (só o VIP entra pela Vaga reservada) mas continua disponível.
 */
export function ConnectButtons({
  server,
  connect,
  className,
}: {
  server: LiveServer;
  connect: Connect;
  className?: string;
}) {
  const t = useTranslations('servers');
  const fullLabel = serverFullLabel(server);
  const copied = connect.copyStatus === 'copied';
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        asChild
        variant={server.state === 'full' ? 'ghost' : 'primary'}
        className={cn('max-md:flex-1 pointer-coarse:hidden', server.state === 'full' && 'bg-hover')}
      >
        <a
          href={steamConnectUrl(server.address)}
          aria-label={t('connect.aria', { server: fullLabel })}
          aria-describedby={connect.help !== 'closed' ? connect.helpId : undefined}
          onClick={connect.opening}
        >
          {t('connect.button')}
        </a>
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('connect.copyAria', { server: fullLabel })}
            onClick={connect.copyAddress}
            className="pointer-coarse:hidden"
          >
            <CopyGlyph copied={copied} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {copied ? t('connect.copied') : t('connect.copy')}
        </TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        aria-label={t('connect.copyAria', { server: fullLabel })}
        onClick={connect.copyAddress}
        className="hidden max-md:flex-1 pointer-coarse:inline-flex"
      >
        <CopyGlyph copied={copied} />
        {copied ? t('connect.copied') : t('connect.copy')}
      </Button>
    </div>
  );
}

/** A instrução do console que abre embaixo do servidor: o que fazer se o `steam://` não abrir. */
export function ConnectHelp({
  server,
  connect,
  showFullHint,
  className,
}: {
  server: LiveServer;
  connect: Connect;
  /** A linha avisa do Lotado aqui; o cartão já o diz o tempo todo. */
  showFullHint: boolean;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {connect.help !== 'closed' ? (
        <m.div
          key="help"
          data-help
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <HelpBody
            server={server}
            connect={connect}
            full={showFullHint && server.state === 'full'}
            className={className}
          />
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

function HelpBody({
  server,
  connect,
  full,
  className,
}: {
  server: LiveServer;
  connect: Connect;
  full: boolean;
  className?: string;
}) {
  const t = useTranslations('servers');
  const status: CopyStatus = connect.copyStatus;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 md:flex-nowrap', className)}>
      <div
        id={connect.helpId}
        role="status"
        className="min-w-0 flex-1 text-[13px] text-muted-foreground max-md:basis-full"
      >
        {connect.help === 'connect' ? (
          <span className="text-foreground">{t('connect.opening')} </span>
        ) : null}
        {t.rich('connect.hint', { address: server.address, cmd })}
        {full ? <span className="block pt-1">{t('row.fullHint')}</span> : null}
        {status === 'failed' ? (
          <span className="block pt-1 text-foreground">{t('connect.copyFailed')}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={connect.copyAddress} data-testid="copy-command">
          <CopyGlyph copied={status === 'copied'} />
          {status === 'copied' ? t('connect.copied') : t('connect.copy')}
        </Button>
        <Button variant="quiet" size="icon" aria-label={t('connect.close')} onClick={connect.close}>
          <AnimatedIcon icon={XIcon} size={16} />
        </Button>
      </div>
    </div>
  );
}
