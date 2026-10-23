import { DISPLAY_NAME_MAX_LENGTH } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { normalizeDisplayName } from './display-name.js';
import { isOffensiveName } from './name-filter.js';
import { PLACEHOLDER_NAMES, placeholderNameFor } from './placeholder-names.js';

describe('PLACEHOLDER_NAMES', () => {
  it('tem nomes de sobra para não repetir a cada duas Contas', () => {
    expect(PLACEHOLDER_NAMES.length).toBeGreaterThanOrEqual(48);
  });

  it('não repete nome', () => {
    expect(new Set(PLACEHOLDER_NAMES).size).toBe(PLACEHOLDER_NAMES.length);
  });

  it('cada nome passa nas regras de um nome próprio (tamanho, caracteres) e no filtro', () => {
    for (const name of PLACEHOLDER_NAMES) {
      expect(normalizeDisplayName(name), name).toEqual({ ok: true, name });
      expect(isOffensiveName(name), name).toBe(false);
      expect([...name].length, name).toBeLessThanOrEqual(DISPLAY_NAME_MAX_LENGTH);
    }
  });

  it('é uma palavra só, com letra maiúscula na frente e sem número (nada que lembre o ID)', () => {
    for (const name of PLACEHOLDER_NAMES) {
      expect(name, name).toMatch(/^\p{Lu}\p{L}+$/u);
    }
  });
});

describe('placeholderNameFor', () => {
  it('é sempre o mesmo para o mesmo ID público', () => {
    expect(placeholderNameFor(10_016)).toBe(placeholderNameFor(10_016));
  });

  it('devolve um dos nomes da lista, para qualquer ID', () => {
    for (const publicId of [1, 2, 3, 99, 10_000, 10_016, 123_456, 2_147_483_647]) {
      expect(PLACEHOLDER_NAMES).toContain(placeholderNameFor(publicId));
    }
  });

  it('não anda em fila: IDs seguidos não dão nomes seguidos na lista', () => {
    const positions = [10_000, 10_001, 10_002, 10_003, 10_004].map((id) =>
      PLACEHOLDER_NAMES.indexOf(placeholderNameFor(id)),
    );
    const steps = positions.slice(1).map((position, i) => position - (positions[i] as number));
    expect(steps.every((step) => step === 1)).toBe(false);
  });

  it('usa a lista toda: 20 mil IDs alcançam todos os nomes, e nenhum passa de 3% do total', () => {
    const counts = new Map<string, number>();
    for (let publicId = 10_000; publicId < 30_000; publicId++) {
      const name = placeholderNameFor(publicId);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    expect(counts.size).toBe(PLACEHOLDER_NAMES.length);
    expect(Math.max(...counts.values())).toBeLessThan(20_000 * 0.03);
  });

  it('fixa a fórmula que a migração de dados repete em SQL (mudar aqui pede nova migração)', () => {
    // A migração 0013 aplica a mesma conta em SQL para quem já tem "Jogador #ID" gravado.
    expect(PLACEHOLDER_NAMES.length).toBe(64);
    expect([10_016, 10_017, 10_018, 12_345].map(placeholderNameFor)).toEqual(
      [10_016, 10_017, 10_018, 12_345].map(
        (id) =>
          PLACEHOLDER_NAMES[
            Number((((BigInt(id) * 2_654_435_761n) % 4_294_967_296n) * 64n) / 4_294_967_296n)
          ],
      ),
    );
  });
});
