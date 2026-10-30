import { describe, expect, it } from 'vitest';
import { desiredRoleKeys, planRoles } from './discord-roles.js';

describe('desiredRoleKeys', () => {
  it('todo vinculado é Jogador', () => {
    expect(desiredRoleKeys({ plan: null, staffRole: null })).toEqual(['player']);
  });

  it('o plano ativo soma o cargo dele, e só ele: Capo ou Padrinho', () => {
    expect(desiredRoleKeys({ plan: 'capo', staffRole: null })).toEqual(['player', 'capo']);
    expect(desiredRoleKeys({ plan: 'padrinho', staffRole: null })).toEqual(['player', 'padrinho']);
  });

  it('qualquer papel de Staff dá o cargo Staff; só o Dono soma o cargo Dono', () => {
    expect(desiredRoleKeys({ plan: null, staffRole: 'moderator' })).toEqual(['player', 'staff']);
    expect(desiredRoleKeys({ plan: null, staffRole: 'admin' })).toEqual(['player', 'staff']);
    expect(desiredRoleKeys({ plan: 'padrinho', staffRole: 'owner' })).toEqual([
      'player',
      'padrinho',
      'staff',
      'owner',
    ]);
  });
});

describe('planRoles', () => {
  const ids = { player: '1', capo: '2', staff: '3', owner: '4', padrinho: '5' };

  it('acrescenta o que falta e tira o gerenciado que sobra', () => {
    const plan = planRoles(ids, ['player'], new Set(['2', '9']));
    expect(plan).toEqual({ add: ['1'], remove: ['2'] });
  });

  it('nunca toca num cargo que não é gerenciado (os cargos da comunidade ficam como estão)', () => {
    expect(planRoles(ids, ['player'], new Set(['1', '9', '10']))).toEqual({ add: [], remove: [] });
  });

  it('cargo sem ID configurado não é gerenciado nem cobrado', () => {
    expect(planRoles({ player: '1' }, ['player', 'capo'], new Set())).toEqual({
      add: ['1'],
      remove: [],
    });
  });

  it('sem cargos desejados (desvínculo), tira todos os gerenciados', () => {
    expect(planRoles(ids, [], new Set(['1', '2', '3', '4', '5', '9']))).toEqual({
      add: [],
      remove: ['1', '2', '3', '4', '5'],
    });
  });
});
