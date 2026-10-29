import { describe, expect, it } from 'vitest';
import { avatarReportDiscordMessage } from './avatar-moderation-discord.js';

const PANEL = 'https://stcarmine.com/staff/fotos';

describe('avatarReportDiscordMessage', () => {
  it('diz o motivo, o Perfil e o link, sem quem denunciou', () => {
    const text = avatarReportDiscordMessage(
      { reason: 'sexual', targetName: 'Lia', targetPublicId: 42, reporters: 1 },
      PANEL,
    );
    expect(text).toContain('Nudez ou conteúdo sexual');
    expect(text).toContain('Lia (#42)');
    expect(text).toContain('1 denúncia');
    expect(text).toContain(PANEL);
  });

  it('a denúncia não tira a foto do ar: o aviso só pede a decisão da Staff', () => {
    const text = avatarReportDiscordMessage(
      { reason: 'hate', targetName: 'Ana', targetPublicId: 7, reporters: 2 },
      PANEL,
    );
    expect(text).toContain('2 denúncias');
    expect(text).toContain('a Staff decide em até 24 h');
    expect(text).not.toContain('Saiu do ar');
  });

  it('limpa o nome: uma linha, sem Markdown e curto', () => {
    const text = avatarReportDiscordMessage(
      {
        reason: 'other',
        targetName: `**@everyone**\n${'x'.repeat(100)}`,
        targetPublicId: 1,
        reporters: 3,
      },
      PANEL,
    );
    const profile = text.split('\n').find((line) => line.startsWith('Perfil:')) ?? '';
    expect(profile).toContain(String.raw`\*\*@everyone\*\*`);
    expect(profile).not.toContain('\n');
    expect(profile.length).toBeLessThan(100);
  });
});
