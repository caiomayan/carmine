import {
  AVATAR_ACCEPTED_TYPES,
  AVATAR_MAX_PX,
  AVATAR_MIN_PX,
  AVATAR_SIZES,
  AVATAR_SQUARE_TOLERANCE,
  type AvatarErrorCode,
  type AvatarSize,
} from '@carmine/contracts/avatar';
import sharp from 'sharp';

/** Uma foto recusada, com o código estável do contrato (`AvatarError`). */
export class AvatarRejection extends Error {
  constructor(
    readonly code: AvatarErrorCode,
    message: string,
    readonly retryAfter?: Date,
  ) {
    super(message);
    this.name = 'AvatarRejection';
  }
}

type AcceptedType = (typeof AVATAR_ACCEPTED_TYPES)[number];

/** O tipo pelos primeiros bytes: o `Content-Type` e a extensão não provam nada. */
export function sniffImageType(bytes: Buffer): AcceptedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Qualidade do WebP: nítido nos 512 px do Perfil sem passar de ~40 kB. */
const WEBP_QUALITY = 82;

/** Pixels que o decodificador aceita: o maior recorte, com folga (contra bomba de descompressão). */
const LIMIT_INPUT_PIXELS = AVATAR_MAX_PX * AVATAR_MAX_PX * 2;

/**
 * Refaz a foto enviada: confere o tipo pelos bytes, decodifica (nunca guarda o arquivo recebido),
 * confere tamanho e proporção, aplica a orientação do EXIF e gera os tamanhos em WebP **sem
 * metadados** (EXIF, GPS e perfil de cor saem). Animada é recusada.
 */
export async function processAvatar(
  body: Buffer,
  declaredType: string,
): Promise<Record<AvatarSize, Buffer>> {
  if (!(AVATAR_ACCEPTED_TYPES as readonly string[]).includes(declaredType)) {
    throw new AvatarRejection('unsupported_type', 'Envie uma foto JPEG, PNG ou WebP');
  }
  if (sniffImageType(body) !== declaredType) {
    throw new AvatarRejection('unsupported_type', 'O arquivo não é do tipo informado');
  }
  const source = () =>
    sharp(body, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: 'error', animated: false });
  let width: number;
  let height: number;
  try {
    const meta = await source().metadata();
    if ((meta.pages ?? 1) > 1) {
      throw new AvatarRejection('invalid_image', 'Foto animada não é aceita');
    }
    // A orientação do EXIF (5 a 8) troca largura e altura na tela.
    const turned = (meta.orientation ?? 1) >= 5;
    width = (turned ? meta.height : meta.width) ?? 0;
    height = (turned ? meta.width : meta.height) ?? 0;
  } catch (error) {
    if (error instanceof AvatarRejection) throw error;
    throw new AvatarRejection('invalid_image', 'Não foi possível abrir a imagem');
  }
  const [shortSide, longSide] = [Math.min(width, height), Math.max(width, height)];
  if (
    shortSide < AVATAR_MIN_PX ||
    longSide > AVATAR_MAX_PX ||
    (longSide - shortSide) / longSide > AVATAR_SQUARE_TOLERANCE
  ) {
    throw new AvatarRejection(
      'bad_dimensions',
      `A foto precisa ser quadrada, de ${AVATAR_MIN_PX} a ${AVATAR_MAX_PX} px de lado`,
    );
  }
  try {
    const variants = await Promise.all(
      AVATAR_SIZES.map(async (size) => {
        const bytes = await source()
          .rotate()
          .resize(size, size, { fit: 'cover' })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        return [size, bytes] as const;
      }),
    );
    return Object.fromEntries(variants) as Record<AvatarSize, Buffer>;
  } catch {
    throw new AvatarRejection('invalid_image', 'Não foi possível processar a imagem');
  }
}
