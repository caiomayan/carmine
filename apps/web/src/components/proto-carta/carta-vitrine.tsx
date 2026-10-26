'use client';

import Link from 'next/link';
import { type CSSProperties, useState } from 'react';
import { DynamicButton } from '@/components/home/dynamic-button';
import {
  CARTA_FORMAT_SPEC,
  CARTA_FORMATS,
  type CartaFormat,
  type CartaOptions,
  type CartaPlayer,
  cartaImagePath,
} from '@/lib/proto-carta/data';
import { cn } from '@/lib/utils';
import { Lanyard } from './lanyard';
import './carta.css';

/**
 * PROTÓTIPO da carta do jogador (vitrine /dev/carta): a imagem compartilhável em três formatos (o que gera o PNG
 * para o WhatsApp, o Discord e o Instagram) e a versão na tela, o cartão pendurado no Lanyard com física. Dados de
 * exemplo; a imagem vem da rota `/dev/carta/imagem`, a mesma do `og:image` da página e da textura do cartão.
 */
export function CartaVitrine({
  options,
  player,
  skinGlow,
}: {
  options: CartaOptions;
  player: CartaPlayer;
  /** A cor viva da skin principal (a luz de fundo da vitrine). */
  skinGlow: string | null;
}) {
  const [shareState, setShareState] = useState<'idle' | 'download'>('idle');
  const spec = CARTA_FORMAT_SPEC[options.format];
  const imagePath = cartaImagePath(options);
  const cardPath = cartaImagePath({ ...options, format: 'cartao' });
  const href = (patch: Partial<CartaOptions>) => {
    const next = { ...options, ...patch };
    const query = new URLSearchParams({ formato: next.format, modo: next.mode });
    if (next.privateProfile) query.set('privado', '1');
    return `/dev/carta?${query.toString()}`;
  };

  /** Compartilha o arquivo (Web Share, no celular) ou baixa o PNG (no computador). */
  const share = async () => {
    try {
      const response = await fetch(imagePath);
      if (!response.ok) return false;
      const blob = await response.blob();
      const file = new File([blob], `saint-carmine-${options.format}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Carta de ${player.name} · Saint Carmine` });
        setShareState('idle');
        return true;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      setShareState('download');
      return true;
    } catch {
      // Quem fecha a folha de compartilhamento cancela: não é erro.
      return false;
    }
  };

  return (
    <main
      className="cv"
      data-testid="carta"
      style={skinGlow ? ({ '--cv-glow': skinGlow } as CSSProperties) : undefined}
    >
      <div className="container-page">
        <header className="cv-head">
          <p className="v-label cv-eyebrow">Protótipo · carta do jogador</p>
          <h1 className="cv-title v-serif">A sua carta da semana</h1>
          <p className="cv-lead">
            Um cartão para mostrar quem você é na Saint Carmine: avatar, nome, Modo favorito, os
            números da semana e a skin principal do Loadout. Na tela ele pende de um cordão; para os
            amigos, vira uma imagem.
          </p>
        </header>

        <div className="cv-grid">
          <section aria-labelledby="cv-screen" className="cv-panel cv-screen">
            <h2 id="cv-screen" className="cv-h2">
              Na tela: o Lanyard
            </h2>
            <Lanyard imageUrl={cardPath} label={`Carta de ${player.name}`} />
          </section>

          <section aria-labelledby="cv-share" className="cv-panel cv-share">
            <h2 id="cv-share" className="cv-h2">
              Para compartilhar
            </h2>

            <nav aria-label="Formato da imagem" className="cv-tabs">
              {CARTA_FORMATS.map((format: CartaFormat) => (
                <Link
                  key={format}
                  href={href({ format }) as never}
                  scroll={false}
                  aria-current={format === options.format ? 'page' : undefined}
                  className="cv-tab"
                >
                  {CARTA_FORMAT_SPEC[format].label}
                </Link>
              ))}
            </nav>
            <p className="cv-hint">{spec.hint}</p>

            <figure className="cv-figure" style={{ aspectRatio: `${spec.width} / ${spec.height}` }}>
              {/* biome-ignore lint/performance/noImgElement: a imagem gerada na hora pela rota, tamanho variável */}
              <img
                key={imagePath}
                src={imagePath}
                alt={`Carta de ${player.name}: ${player.modeLabel}, ${player.weekLabel}`}
                width={spec.width}
                height={spec.height}
                data-testid="carta-imagem"
              />
            </figure>

            <div className="cv-actions">
              <DynamicButton
                idle="Compartilhar"
                loading="Gerando a imagem"
                done={shareState === 'download' ? 'Imagem baixada' : 'Pronto'}
                ariaLabel="Compartilhar a carta como imagem"
                loadingMs={400}
                doneMs={1800}
                onAction={share}
                testId="carta-compartilhar"
              />
              <a
                className="cv-link"
                href={imagePath}
                download={`saint-carmine-${options.format}.png`}
              >
                Baixar o PNG
              </a>
              <a className="cv-link" href={imagePath} target="_blank" rel="noopener noreferrer">
                Abrir em tamanho real
              </a>
            </div>

            <nav className="cv-toggles" aria-label="Variações do exemplo">
              <Link
                href={href({ privateProfile: !options.privateProfile }) as never}
                scroll={false}
                aria-current={options.privateProfile ? 'true' : undefined}
                className={cn('cv-chip', options.privateProfile && 'is-on')}
              >
                Perfil privado
              </Link>
              <Link
                href={href({ mode: options.mode === 'retake' ? 'deathmatch' : 'retake' }) as never}
                scroll={false}
                aria-current={options.mode === 'deathmatch' ? 'true' : undefined}
                className={cn('cv-chip', options.mode === 'deathmatch' && 'is-on')}
              >
                Modo favorito: Deathmatch
              </Link>
            </nav>
          </section>
        </div>

        <section aria-labelledby="cv-how" className="cv-how">
          <h2 id="cv-how" className="cv-h2">
            O que gera a imagem
          </h2>
          <ul className="cv-how-list">
            <li>
              <b>Uma rota</b>
              <span>
                <code>GET /dev/carta/imagem?formato=cartao|story|og</code>. Na versão de verdade,{' '}
                <code>/&lt;id&gt;/carta</code>, que lê o Perfil.
              </span>
            </li>
            <li>
              <b>Sem navegador</b>
              <span>
                O React vira SVG (Satori) e o SVG vira PNG (resvg), dentro do próprio Next. Marca
                preto e branco; a cor vem da skin principal.
              </span>
            </li>
            <li>
              <b>Os mesmos dados do Perfil</b>
              <span>
                Nome, avatar, Modo favorito, números da semana e a skin do Loadout. O Perfil privado
                sai sem números; o ID público nunca aparece.
              </span>
            </li>
            <li>
              <b>Três usos, uma imagem</b>
              <span>
                O botão Compartilhar (a folha do celular), o <code>og:image</code> da página, que
                aparece na prévia do link no Discord e no WhatsApp, e a textura do Lanyard.
              </span>
            </li>
            <li>
              <b>Cache</b>
              <span>
                1 hora no CDN, e a imagem só muda quando o Perfil muda. As fontes entram no
                repositório (hoje, no protótipo, vêm do Google Fonts na primeira geração).
              </span>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
