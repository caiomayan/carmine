import { describe, expect, it } from 'vitest';
import { RANKING_WEEK_SEEN_KEY, weekTurnedSinceLastVisit } from './ranking-week-seen';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('weekTurnedSinceLastVisit', () => {
  it('na primeira visita não houve virada, e a semana fica guardada', () => {
    const storage = memoryStorage();
    expect(weekTurnedSinceLastVisit(storage, '2026-10-19')).toBe(false);
    expect(storage.getItem(RANKING_WEEK_SEEN_KEY)).toBe('2026-10-19');
  });

  it('na mesma semana não há virada', () => {
    const storage = memoryStorage({ [RANKING_WEEK_SEEN_KEY]: '2026-10-19' });
    expect(weekTurnedSinceLastVisit(storage, '2026-10-19')).toBe(false);
  });

  it('depois da virada vale uma vez só', () => {
    const storage = memoryStorage({ [RANKING_WEEK_SEEN_KEY]: '2026-10-19' });
    expect(weekTurnedSinceLastVisit(storage, '2026-10-26')).toBe(true);
    expect(storage.getItem(RANKING_WEEK_SEEN_KEY)).toBe('2026-10-26');
    expect(weekTurnedSinceLastVisit(storage, '2026-10-26')).toBe(false);
  });

  it('sem armazenamento, ou com ele quebrado, nunca anima nem lança erro', () => {
    expect(weekTurnedSinceLastVisit(null, '2026-10-26')).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
    } as unknown as Storage;
    expect(weekTurnedSinceLastVisit(broken, '2026-10-26')).toBe(false);
  });
});
