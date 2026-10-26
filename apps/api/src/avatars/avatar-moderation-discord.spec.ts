import { describe, expect, it } from 'vitest';
import { avatarReportDiscordMessage } from './avatar-moderation-discord.js';

const PANEL = 'https://stcarmine.com/staff/fotos';

describe('avatarReportDiscordMessage', () => {
  it('diz o motivo, o Perfil e o link, sem quem denunciou', () => {
    const text = avatarReportDiscordMessage(
      { reason: 'sexual', targetName: 'Lia', targetPublicId: 42, reporters: 1, suspended: false },
      PANEL,
    );
    expect(text).toContain('Nudez ou conteúdo sexual');
    expect(text).toContain('Lia (#42)');
    expect(text).toContain('1 denúncia');
    expect(text).toContain(PANEL);
  });

  it('avisa que a foto saiu do ar', () => {
    const text = avatarReportDiscordMessage(
      { reason: 'hate', targetName: 'Ana', targetPublicId: 7, reporters: 2, suspended: true },
      PANEL,
    );
    expect(text).toContain('Saiu do ar com 2 denúncias');
  });

  it('limpa o nome: uma linha, sem Markdown e curto', () => {
    const text = avatarReportDiscordMessage(
      {
        reason: 'other',
        targetName: `**@everyone**\n${'x'.repeat(100)}`,
        targetPublicId: 1,
        reporters: 3,
        suspended: false,
      },
      PANEL,
    );
    const profile = text.split('\n').find((line) => line.startsWith('Perfil:')) ?? '';
    expect(profile).toContain(String.raw`\*\*@everyone\*\*`);
    expect(profile).not.toContain('\n');
    expect(profile.length).toBeLessThan(100);
  });
});
