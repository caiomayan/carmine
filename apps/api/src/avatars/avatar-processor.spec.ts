import { AVATAR_SIZES } from '@carmine/contracts/avatar';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AvatarRejection, processAvatar, sniffImageType } from './avatar-processor.js';

/** Uma imagem sólida de `width` x `height` nos formatos aceitos. */
async function image(
  format: 'jpeg' | 'png' | 'webp',
  width = 512,
  height = width,
  options: { exif?: boolean } = {},
): Promise<Buffer> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 60 } },
  });
  if (options.exif) {
    pipeline = pipeline.withExif({ IFD0: { Copyright: 'fotografo-secreto' } });
  }
  return pipeline[format]().toBuffer();
}

const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('devia ter recusado');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(AvatarRejection);
      return (error as AvatarRejection).code;
    },
  );

describe('processAvatar', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'refaz um %s em WebP nos 4 tamanhos, quadrados',
    async (format) => {
      const variants = await processAvatar(await image(format), `image/${format}`);

      for (const size of AVATAR_SIZES) {
        const meta = await sharp(variants[size]).metadata();
        expect(meta).toMatchObject({ format: 'webp', width: size, height: size });
      }
    },
  );

  it('não guarda EXIF nem GPS: o que a foto trazia não chega a nenhum tamanho', async () => {
    const original = await image('jpeg', 512, 512, { exif: true });
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const variants = await processAvatar(original, 'image/jpeg');

    for (const size of AVATAR_SIZES) {
      expect((await sharp(variants[size]).metadata()).exif).toBeUndefined();
      expect(variants[size].includes(Buffer.from('fotografo-secreto'))).toBe(false);
    }
  });

  it('aceita quase quadrada (até 2%) e recorta o centro', async () => {
    const variants = await processAvatar(await image('png', 512, 505), 'image/png');

    expect(await sharp(variants[512]).metadata()).toMatchObject({ width: 512, height: 512 });
  });

  it('a orientação do EXIF vale antes de conferir a proporção', async () => {
    // 300x256 deitada (EXIF 6 gira 90°) vira 256x300: continua torta e é recusada.
    const turned = await sharp({
      create: { width: 300, height: 256, channels: 3, background: '#336699' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    expect(await rejection(processAvatar(turned, 'image/jpeg'))).toBe('bad_dimensions');
  });

  it.each([
    ['pequena demais', 255, 255],
    ['grande demais', 1025, 1025],
    ['retangular', 512, 400],
  ])('recusa foto %s com bad_dimensions', async (_name, width, height) => {
    expect(await rejection(processAvatar(await image('png', width, height), 'image/png'))).toBe(
      'bad_dimensions',
    );
  });

  it('recusa o que não é JPEG, PNG ou WebP, e o tipo que não bate com os bytes', async () => {
    const png = await image('png');
    const gif = await sharp(png).gif().toBuffer();

    expect(await rejection(processAvatar(gif, 'image/gif'))).toBe('unsupported_type');
    expect(await rejection(processAvatar(png, 'image/jpeg'))).toBe('unsupported_type');
    expect(await rejection(processAvatar(Buffer.from('<svg/>'), 'image/svg+xml'))).toBe(
      'unsupported_type',
    );
  });

  it('recusa bytes que têm a assinatura mas não abrem', async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

    expect(await rejection(processAvatar(broken, 'image/jpeg'))).toBe('invalid_image');
  });

  it('recusa foto animada', async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 256, height: 256, channels: 3, background } })
        .png()
        .toBuffer();
    const animated = await sharp([await frame('#ffffff'), await frame('#000000')], {
      join: { animated: true },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);

    expect(await rejection(processAvatar(animated, 'image/webp'))).toBe('invalid_image');
  });
});

describe('sniffImageType', () => {
  it('reconhece JPEG, PNG e WebP pelos primeiros bytes', async () => {
    expect(sniffImageType(await image('jpeg', 8))).toBe('image/jpeg');
    expect(sniffImageType(await image('png', 8))).toBe('image/png');
    expect(sniffImageType(await image('webp', 8))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});
