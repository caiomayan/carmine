import type { LiveServer, LiveServerList } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { buildStatusMessage } from './discord-status-board.js';

const server = (overrides: Partial<LiveServer>): LiveServer => ({
  id: 'a',
  name: 'retake-1',
  showcaseName: 'Retake · Rotação',
  code: 'SP·1',
  mode: 'retake',
  address: '203.0.113.5:27015',
  region: 'sao-paulo',
  state: 'online',
  map: 'de_nuke',
  players: 5,
  maxPlayers: 9,
  lastHeartbeatAt: '2026-10-19T12:00:00.000Z',
  lastMap: 'de_nuke',
  ...overrides,
});

const list = (servers: LiveServer[]): LiveServerList => ({
  servers,
  summary: {
    online: servers.filter((s) => s.state !== 'offline').length,
    players: servers.reduce((total, s) => total + s.players, 0),
  },
  generatedAt: '2026-10-19T12:00:05.000Z',
});

describe('buildStatusMessage', () => {
  it('mostra nome, Modo, estado, jogadores/vagas, mapa e endereço de cada servidor', () => {
    const { embeds } = buildStatusMessage(list([server({})]), 'https://stcarmine.com');

    expect(embeds[0]?.description).toBe(
      '🟢 **Retake · Rotação** (SP·1) · Retake · online\n5/9 jogadores · de_nuke · `203.0.113.5:27015`',
    );
  });

  it('servidor offline não mostra jogadores nem mapa; lotado aparece como tal', () => {
    const { embeds } = buildStatusMessage(
      list([
        server({ state: 'offline', map: null, players: 0 }),
        server({
          id: 'b',
          name: 'dm-1',
          showcaseName: null,
          code: null,
          mode: 'deathmatch',
          state: 'full',
          players: 16,
          maxPlayers: 16,
          map: 'de_dust2',
        }),
      ]),
      'https://stcarmine.com',
    );

    expect(embeds[0]?.description).toContain(
      '🔴 **Retake · Rotação** (SP·1) · Retake · offline\noffline ·',
    );
    expect(embeds[0]?.description).toContain(
      '🟡 **dm-1** · Deathmatch · lotado\n16/16 jogadores · de_dust2',
    );
  });

  it('traz os links do site, do Ranking e das regras e a hora da lista', () => {
    const { embeds } = buildStatusMessage(list([server({})]), 'https://stcarmine.com');
    const fields = embeds[0]?.fields as { name: string; value: string }[];

    expect(fields.find((f) => f.name === 'Links')?.value).toBe(
      '[Site](https://stcarmine.com) · [Ranking](https://stcarmine.com/ranking) · [Regras](https://stcarmine.com/rules)',
    );
    expect(fields.find((f) => f.name === 'Agora')?.value).toBe('1 servidor no ar · 5 jogadores');
    expect(embeds[0]?.timestamp).toBe('2026-10-19T12:00:05.000Z');
  });
});
