import { describe, expect, it } from 'vitest';
import { navFor } from './nav';

const ids = (role: Parameters<typeof navFor>[0]) => navFor(role).map((item) => item.id);

describe('o trilho por papel (a mesma tabela de permissões da API)', () => {
  it('o Moderador vê Início, Denúncias, Fotos e Contas, e não as telas de gestão', () => {
    expect(ids('moderator')).toEqual(['inicio', 'denuncias', 'fotos', 'contas']);
  });

  it('o Admin e o Dono veem todas as telas', () => {
    const all = ['inicio', 'denuncias', 'fotos', 'contas', 'pagamentos', 'servidores', 'auditoria'];
    expect(ids('admin')).toEqual(all);
    expect(ids('owner')).toEqual(all);
  });

  it('o Início está sempre no trilho', () => {
    for (const role of ['owner', 'admin', 'moderator'] as const) {
      expect(ids(role)[0]).toBe('inicio');
    }
  });
});
