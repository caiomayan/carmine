import { describe, expect, it } from 'vitest';
import { profileMetadata } from './profile-metadata';

const profile = {
  publicId: 10_016,
  displayName: 'coldzera',
  avatarUrl: 'https://avatars.example/coldzera.jpg',
  isPrivate: false,
};
const description = 'Perfil de coldzera na Carmine: o Loadout que aparece nos Servidores Carmine.';

describe('profileMetadata (prévia do link)', () => {
  it('leva só nome, ID público e avatar', () => {
    const metadata = profileMetadata(profile, description);

    expect(metadata.title).toBe('coldzera · #10016');
    expect(metadata.description).toBe(description);
    expect(metadata.openGraph).toMatchObject({
      title: 'coldzera · #10016',
      description,
      images: [{ url: profile.avatarUrl, alt: '' }],
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary', description });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('Perfil privado: a prévia é a mesma e nunca carrega Estatísticas', () => {
    // As Estatísticas chegam na S12. Mesmo que o Perfil carregue dados a mais, a prévia só lê
    // os quatro campos acima: nada de K/D, kills ou tempo jogado, em nenhum campo da prévia.
    const withStats = {
      ...profile,
      isPrivate: true,
      stats: { kills: 4242, deaths: 1111, kd: 3.82, minutesPlayed: 98_765 },
    };

    const metadata = profileMetadata(withStats, description);

    expect(metadata).toEqual(profileMetadata({ ...profile, isPrivate: true }, description));
    expect(JSON.stringify(metadata)).not.toMatch(/4242|1111|3\.82|98765|kills|stats/i);
  });

  it('sem avatar, a prévia fica sem imagem', () => {
    const metadata = profileMetadata({ ...profile, avatarUrl: null }, description);

    expect(metadata.openGraph).toMatchObject({ images: undefined });
    expect(metadata.twitter).toMatchObject({ images: undefined });
  });
});
