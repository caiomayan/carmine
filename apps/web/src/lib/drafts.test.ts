import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, DRAFT_MAX_AGE_MS, loadDraft, saveDraft } from './drafts';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

const NOW = Date.UTC(2026, 9, 11, 12);

describe('rascunhos locais', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('guarda e devolve o rascunho da mesma Conta', () => {
    saveDraft(storage, 'item-editor', 10016, { float: 0.15, seed: 661 }, NOW);
    expect(loadDraft(storage, 'item-editor', 10016, NOW + 1000)).toEqual({
      value: { float: 0.15, seed: 661 },
      savedAt: NOW,
    });
  });

  it('não entrega o rascunho a outra Conta', () => {
    saveDraft(storage, 'item-editor', 10016, { seed: 1 }, NOW);
    expect(loadDraft(storage, 'item-editor', 10019, NOW)).toBeNull();
  });

  it('descarta rascunhos velhos', () => {
    saveDraft(storage, 'item-editor', 10016, { seed: 1 }, NOW);
    expect(loadDraft(storage, 'item-editor', 10016, NOW + DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.items.size).toBe(0);
  });

  it('ignora conteúdo corrompido sem quebrar', () => {
    storage.setItem('carmine-draft:item-editor', '{nope');
    expect(loadDraft(storage, 'item-editor', 10016, NOW)).toBeNull();
    storage.setItem('carmine-draft:item-editor', JSON.stringify({ v: 99 }));
    expect(loadDraft(storage, 'item-editor', 10016, NOW)).toBeNull();
  });

  it('apaga o rascunho depois de salvo', () => {
    saveDraft(storage, 'item-editor', 10016, { seed: 1 }, NOW);
    clearDraft(storage, 'item-editor');
    expect(loadDraft(storage, 'item-editor', 10016, NOW)).toBeNull();
  });

  it('armazenamento bloqueado não derruba a edição', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(saveDraft(blocked, 'x', 1, 'v', NOW)).toBe(false);
    expect(loadDraft(blocked, 'x', 1, NOW)).toBeNull();
    expect(() => clearDraft(blocked, 'x')).not.toThrow();
  });
});
