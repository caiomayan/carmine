/**
 * A carta do jogador (protótipo, vitrine /dev/carta): o cartão compartilhável, em três formatos, e o que ele mostra.
 * Tudo aqui é puro (serve à rota da imagem, à página e aos testes). Os dados do jogador são um exemplo fictício;
 * na versão de verdade vêm do Perfil (nome, avatar, Modo favorito, números da semana, skin principal do Loadout),
 * com a regra do Perfil privado: sem Estatísticas, só nome, avatar e Loadout.
 */

export const CARTA_FORMATS = ['cartao', 'story', 'og'] as const;
export type CartaFormat = (typeof CARTA_FORMATS)[number];

export const CARTA_FORMAT_SPEC: Record<
  CartaFormat,
  { width: number; height: number; label: string; hint: string }
> = {
  cartao: {
    width: 1080,
    height: 1350,
    label: 'Cartão',
    hint: 'Feed do Instagram e WhatsApp (4:5)',
  },
  story: { width: 1080, height: 1920, label: 'Story', hint: 'Stories e status (9:16)' },
  og: {
    width: 1200,
    height: 630,
    label: 'Link',
    hint: 'Prévia do link no Discord e no WhatsApp (1,91:1)',
  },
};

export type CartaMode = 'retake' | 'deathmatch';

/** Os números da semana, já formatados em pt-BR; nulo no Perfil privado (a regra do Perfil: sem Estatísticas). */
export type CartaStats = {
  /** O número do Modo: rounds vencidos no Retake, abates por minuto no Deathmatch. */
  primary: { label: string; value: string };
  kd: string;
  headshots: string;
  hours: string;
};

export type CartaPlayer = {
  name: string;
  /** Sem avatar da Steam, as iniciais (o avatar padrão do site). */
  initials: string;
  mode: CartaMode;
  modeLabel: string;
  weekLabel: string;
  stats: CartaStats | null;
};

export type CartaOptions = { format: CartaFormat; privateProfile: boolean; mode: CartaMode };

export function isCartaFormat(value: string | null | undefined): value is CartaFormat {
  return (
    value !== null && value !== undefined && (CARTA_FORMATS as readonly string[]).includes(value)
  );
}

/** Lê `?formato=`, `?privado=1` e `?modo=`; o que não vale cai no padrão (cartão, público, Retake). */
export function parseCarta(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): CartaOptions {
  const read = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const format = read('formato');
  return {
    format: isCartaFormat(format) ? format : 'cartao',
    privateProfile: read('privado') === '1',
    mode: read('modo') === 'deathmatch' ? 'deathmatch' : 'retake',
  };
}

/** O jogador de exemplo (nome fictício). */
export function examplePlayer({
  privateProfile,
  mode,
}: Pick<CartaOptions, 'privateProfile' | 'mode'>): CartaPlayer {
  const retake = mode === 'retake';
  return {
    name: 'Rafa Tavares',
    initials: 'RT',
    mode,
    modeLabel: retake ? 'Retake' : 'Deathmatch',
    weekLabel: 'Semana de 19 a 25 de outubro',
    stats: privateProfile
      ? null
      : {
          primary: retake
            ? { label: 'Rounds vencidos', value: '187' }
            : { label: 'Abates por minuto', value: '2,41' },
          kd: '1,42',
          headshots: '47%',
          hours: '12,5 h',
        },
  };
}

/** A URL da imagem (a mesma rota serve a página, o `og:image` e o download). */
export function cartaImagePath(options: CartaOptions, base = '/dev/carta/imagem'): string {
  const query = new URLSearchParams({ formato: options.format, modo: options.mode });
  if (options.privateProfile) query.set('privado', '1');
  return `${base}?${query.toString()}`;
}

/** As cores da raridade para a imagem (a imagem não lê as variáveis CSS do site; o tema escuro dos tokens). */
export const RARITY_HEX: Record<string, string> = {
  consumer: '#b0c3d9',
  industrial: '#5e98d9',
  milspec: '#4b69ff',
  restricted: '#8847ff',
  classified: '#d32ce6',
  covert: '#eb4b4b',
  contraband: '#e4ae39',
};
