import { describe, expect, it } from 'vitest';
import { desiredRoleKeys, planRoles } from './discord-roles.js';

describe('desiredRoleKeys', () => {
  it('todo vinculado é Jogador', () => {
    expect(desiredRoleKeys({ vipActive: false, staffRole: null })).toEqual(['player']);
  });

  it('VIP ativo soma o cargo VIP', () => {
    expect(desiredRoleKeys({ vipActive: true, staffRole: null })).toEqual(['player', 'vip']);
  });

  it('qualquer papel de Staff dá o cargo Staff; só o Dono soma o cargo Dono', () => {
    expect(desiredRoleKeys({ vipActive: false, staffRole: 'moderator' })).toEqual([
      'player',
      'staff',
    ]);
    expect(desiredRoleKeys({ vipActive: false, staffRole: 'admin' })).toEqual(['player', 'staff']);
    expect(desiredRoleKeys({ vipActive: true, staffRole: 'owner' })).toEqual([
      'player',
      'vip',
      'staff',
      'owner',
    ]);
  });
});

describe('planRoles', () => {
  const ids = { player: '1', vip: '2', staff: '3', owner: '4' };

  it('acrescenta o que falta e tira o gerenciado que sobra', () => {
    const plan = planRoles(ids, ['player'], new Set(['2', '9']));
    expect(plan).toEqual({ add: ['1'], remove: ['2'] });
  });

  it('nunca toca num cargo que não é gerenciado (os cargos da comunidade ficam como estão)', () => {
    expect(planRoles(ids, ['player'], new Set(['1', '9', '10']))).toEqual({ add: [], remove: [] });
  });

  it('cargo sem ID configurado não é gerenciado nem cobrado', () => {
    expect(planRoles({ player: '1' }, ['player', 'vip'], new Set())).toEqual({
      add: ['1'],
      remove: [],
    });
  });

  it('sem cargos desejados (desvínculo), tira todos os gerenciados', () => {
    expect(planRoles(ids, [], new Set(['1', '2', '3', '4', '9']))).toEqual({
      add: [],
      remove: ['1', '2', '3', '4'],
    });
  });
});
