import { describe, expect, it } from 'vitest';
import { staticEntries } from './entries';

const ids = (context: Parameters<typeof staticEntries>[0]) =>
  staticEntries(context).map((entry) => entry.id);

const visitor = { account: null, staff: false };
const player = { account: { publicId: 10_016 }, staff: false };
const staff = { account: { publicId: 10_016 }, staff: true };

describe('staticEntries', () => {
  it('o visitante vê as páginas públicas, o tema e a entrada', () => {
    expect(ids(visitor)).toEqual([
      'servers',
      'inventory',
      'loadout',
      'ranking',
      'settings',
      'theme',
      'signIn',
    ]);
  });

  it('quem entrou ganha Meu perfil, Primeiros passos e Sair; sai o "Entrar"', () => {
    expect(ids(player)).toEqual([
      'servers',
      'inventory',
      'loadout',
      'ranking',
      'profile',
      'settings',
      'theme',
      'firstSteps',
      'signOut',
    ]);
  });

  it('o Painel da Staff é só da Staff', () => {
    expect(ids(player)).not.toContain('staff');
    expect(ids(visitor)).not.toContain('staff');
    expect(ids(staff)).toContain('staff');
  });

  it('o Perfil aponta para o ID público da própria Conta', () => {
    const profile = staticEntries(player).find((entry) => entry.id === 'profile');

    expect(profile).toMatchObject({ group: 'pages', kind: 'link', href: '/10016' });
  });

  it('páginas levam a uma rota; ações são comandos', () => {
    for (const entry of staticEntries(staff)) {
      if (entry.group === 'pages') expect(entry.kind).toBe('link');
      if (entry.group === 'actions') {
        expect(entry.kind === 'action' || entry.kind === 'link').toBe(true);
      }
    }
    expect(staticEntries(player).find((e) => e.id === 'signOut')).toMatchObject({
      group: 'actions',
      kind: 'action',
    });
    expect(staticEntries(visitor).find((e) => e.id === 'signIn')).toMatchObject({
      group: 'actions',
      kind: 'link',
    });
  });

  it('cada entrada tem um id único', () => {
    const all = ids(staff);
    expect(new Set(all).size).toBe(all.length);
  });
});
