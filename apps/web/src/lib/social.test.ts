import { describe, expect, it } from 'vitest';
import { socialLinks } from './social';

describe('socialLinks', () => {
  it('sem endereços configurados, não mostra nenhuma rede', () => {
    expect(socialLinks({})).toEqual([]);
  });

  it('mostra só as redes configuradas, na ordem fixa do rodapé', () => {
    const links = socialLinks({
      NEXT_PUBLIC_YOUTUBE_URL: 'https://youtube.com/@carmine',
      NEXT_PUBLIC_DISCORD_URL: 'https://discord.gg/carmine',
    });
    expect(links.map((l) => [l.id, l.href])).toEqual([
      ['discord', 'https://discord.gg/carmine'],
      ['youtube', 'https://youtube.com/@carmine'],
    ]);
  });

  it('cada rede leva o ícone da própria marca', () => {
    const [discord] = socialLinks({ NEXT_PUBLIC_DISCORD_URL: 'https://discord.gg/carmine' });
    expect(discord?.icon.slug).toBe('discord');
  });

  it('ignora valores vazios e endereços que não são https', () => {
    expect(
      socialLinks({
        NEXT_PUBLIC_DISCORD_URL: '  ',
        NEXT_PUBLIC_INSTAGRAM_URL: 'http://instagram.com/carmine',
        NEXT_PUBLIC_X_URL: 'javascript:alert(1)',
        NEXT_PUBLIC_YOUTUBE_URL: 'não é url',
      }),
    ).toEqual([]);
  });
});
