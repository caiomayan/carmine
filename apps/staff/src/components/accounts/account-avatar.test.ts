import { AVATAR_BLOCK_DAYS_MAX } from '@carmine/contracts/avatar';
import { describe, expect, it } from 'vitest';
import { validateAvatarRemoval } from './account-avatar';

describe('remoção da foto na ficha', () => {
  it('pede o motivo primeiro', () => {
    expect(validateAvatarRemoval('', '7')).toMatchObject({ field: 'reason' });
  });

  it('dias em branco valem 0 (sem bloqueio)', () => {
    expect(validateAvatarRemoval('violence', '  ')).toEqual({ days: 0 });
  });

  it('aceita de 0 ao máximo', () => {
    expect(validateAvatarRemoval('violence', '0')).toEqual({ days: 0 });
    expect(validateAvatarRemoval('violence', String(AVATAR_BLOCK_DAYS_MAX))).toEqual({
      days: AVATAR_BLOCK_DAYS_MAX,
    });
  });

  it.each(['e', 'abc', '-1', '1.5', String(AVATAR_BLOCK_DAYS_MAX + 1)])(
    'texto ou número inválido (%s) é erro nos dias, nunca 0',
    (value) => {
      expect(validateAvatarRemoval('violence', value)).toMatchObject({ field: 'days' });
    },
  );
});
