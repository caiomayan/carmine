import { describe, expect, it } from 'vitest';

// Teste propositalmente quebrado: demonstra que a CI reprova o PR (S00). Não fazer merge.
describe('demonstração da CI', () => {
  it('falha de propósito', () => {
    expect(1 + 1).toBe(3);
  });
});
