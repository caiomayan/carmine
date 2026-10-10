import { describe, expect, it } from 'vitest';
import { playerConnectSchema } from './game-server.js';

describe('playerConnectSchema', () => {
  it('aceita um connect ao vivo, sem horário', () => {
    const connect = { steamId: '76561198000000000', steamName: 'coldzera' };

    expect(playerConnectSchema.parse(connect)).toEqual(connect);
  });

  it('aceita um connect reenviado com o horário original', () => {
    const connect = {
      steamId: '76561198000000000',
      steamName: 'coldzera',
      connectedAt: '2026-10-10T18:00:00.000Z',
    };

    expect(playerConnectSchema.parse(connect)).toEqual(connect);
  });

  it('rejeita um SteamID inválido e um horário sem fuso', () => {
    expect(playerConnectSchema.safeParse({ steamId: '123', steamName: 'x' }).success).toBe(false);
    expect(
      playerConnectSchema.safeParse({
        steamId: '76561198000000000',
        steamName: 'x',
        connectedAt: '2026-10-10 18:00',
      }).success,
    ).toBe(false);
  });
});
