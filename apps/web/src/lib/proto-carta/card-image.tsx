import type { ShowSkin } from '@/lib/proto-sobre/skins';
import { CARTA_FORMAT_SPEC, type CartaFormat, type CartaPlayer, RARITY_HEX } from './data';

/**
 * O que o `ImageResponse` desenha: o cartão da carta, em JSX com estilos em linha (o Satori entende um subconjunto do
 * CSS: flexbox, gradientes, rotação e imagens; nada de grid nem de variáveis CSS). Três formatos: o cartão (4:5) e o
 * story (9:16) são a mesma composição em alturas diferentes; o de link (1,91:1) põe o texto à esquerda e a skin à
 * direita. Marca preto e branco; a cor vem da skin principal do Loadout (as luzes de fundo e a barra da raridade).
 */

const INK = '#f4f1ea';
const MUTED = '#a8a8a8';
const SANS = 'Inter, sans-serif';
const SIGN = '"Big Shoulders", Impact, sans-serif';
const SERIF = '"DM Serif Display", Georgia, serif';

type Props = {
  format: CartaFormat;
  player: CartaPlayer;
  skin: ShowSkin | null;
};

function glow(skin: ShowSkin | null): [string, string] {
  const rarity = RARITY_HEX[skin?.rarity ?? 'milspec'] ?? '#4b69ff';
  return [skin?.palette?.[0] ?? rarity, skin?.palette?.[1] ?? skin?.palette?.[0] ?? rarity];
}

export function CartaImage({ format, player, skin }: Props) {
  const spec = CARTA_FORMAT_SPEC[format];
  const [c1, c2] = glow(skin);
  const rarity = RARITY_HEX[skin?.rarity ?? 'milspec'] ?? '#4b69ff';
  const landscape = format === 'og';
  const tall = format === 'story';
  const pad = landscape ? 56 : 68;

  const background = [
    `radial-gradient(circle at ${landscape ? '78% 30%' : '78% 22%'}, ${c1}66 0%, ${c1}00 ${landscape ? '48%' : '52%'})`,
    `radial-gradient(circle at ${landscape ? '12% 100%' : '10% 78%'}, ${c2}44 0%, ${c2}00 46%)`,
    'linear-gradient(180deg, #0f0f0f 0%, #080808 100%)',
  ].join(', ');

  const head = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontFamily: SIGN,
          fontWeight: 800,
          fontSize: landscape ? 34 : 46,
          letterSpacing: 3,
          color: INK,
        }}
      >
        SAINT CARMINE
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: SANS,
          fontWeight: 500,
          fontSize: landscape ? 20 : 26,
          color: MUTED,
        }}
      >
        {player.weekLabel}
      </div>
    </div>
  );

  const identity = (
    <div style={{ display: 'flex', alignItems: 'center', gap: landscape ? 22 : 30 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: landscape ? 92 : 128,
          height: landscape ? 92 : 128,
          borderRadius: 999,
          background: INK,
          color: '#0b0b0b',
          fontFamily: SIGN,
          fontWeight: 800,
          fontSize: landscape ? 46 : 64,
        }}
      >
        {player.initials}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: landscape ? 8 : 12 }}>
        <div
          style={{
            display: 'flex',
            fontFamily: SIGN,
            fontWeight: 800,
            textTransform: 'uppercase',
            fontSize: landscape ? 72 : 104,
            lineHeight: 0.9,
            color: INK,
          }}
        >
          {player.name}
        </div>
        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex',
              borderRadius: 10,
              padding: landscape ? '5px 14px' : '7px 18px',
              background: INK,
              color: '#0b0b0b',
              fontFamily: SIGN,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 2,
              fontSize: landscape ? 26 : 34,
            }}
          >
            {player.modeLabel}
          </div>
        </div>
      </div>
    </div>
  );

  const stats = player.stats;
  const statItems = stats
    ? [
        { label: stats.primary.label, value: stats.primary.value },
        { label: 'K/D', value: stats.kd },
        { label: 'Headshots', value: stats.headshots },
        { label: 'Tempo jogado', value: stats.hours },
      ]
    : [];
  const statsRow = stats ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', width: '100%', gap: landscape ? 18 : 0 }}>
      {statItems.map((item) => (
        <div
          key={item.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            width: landscape ? '46%' : item === statItems[0] ? '32%' : '22.6%',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: landscape ? 16 : 20,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: SERIF,
              fontSize: landscape ? 52 : 76,
              lineHeight: 1,
              color: INK,
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div
      style={{
        display: 'flex',
        width: '100%',
        borderRadius: 28,
        padding: landscape ? '18px 24px' : '28px 34px',
        background: 'rgba(255,255,255,0.07)',
        fontFamily: SANS,
        fontWeight: 500,
        fontSize: landscape ? 22 : 30,
        color: MUTED,
      }}
    >
      Estatísticas privadas. Nome, Loadout e presença continuam públicos.
    </div>
  );

  const skinBlock = skin ? (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: landscape ? 16 : 22,
        ...(landscape ? { width: '100%' } : {}),
      }}
    >
      {skin.image ? (
        // biome-ignore lint/performance/noImgElement: o Satori desenha <img>, não o next/image
        <img
          src={skin.image}
          alt=""
          width={landscape ? 520 : tall ? 900 : 860}
          height={landscape ? 390 : tall ? 675 : 645}
          style={{ objectFit: 'contain', transform: 'rotate(-7deg)' }}
        />
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: landscape ? 24 : 34,
            color: INK,
          }}
        >
          {skin.subtitle ? `${skin.title} | ${skin.subtitle}` : skin.title}
        </div>
        <div
          style={{ display: 'flex', width: 64, height: 6, borderRadius: 3, background: rarity }}
        />
      </div>
    </div>
  ) : null;

  const footer = (
    <div
      style={{
        display: 'flex',
        fontFamily: SANS,
        fontWeight: 500,
        fontSize: landscape ? 20 : 26,
        color: '#7a7a7a',
      }}
    >
      stcarmine.com
    </div>
  );

  if (landscape) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: spec.width,
          height: spec.height,
          padding: pad,
          background,
          justifyContent: 'space-between',
        }}
      >
        {head}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 34, width: 600 }}>
            {identity}
            {statsRow}
          </div>
          <div style={{ display: 'flex', width: 440, justifyContent: 'center' }}>{skinBlock}</div>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: spec.width,
        height: spec.height,
        padding: pad,
        background,
        justifyContent: 'space-between',
      }}
    >
      {head}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {skinBlock}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: tall ? 56 : 44 }}>
        {identity}
        {statsRow}
        {footer}
      </div>
    </div>
  );
}
