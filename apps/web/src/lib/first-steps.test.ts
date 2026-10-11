import { describe, expect, it } from 'vitest';
import { FIRST_STEPS_COOKIE, firstStepsCookie, hasDismissedFirstSteps } from './first-steps';

describe('primeiros passos', () => {
  it('abre para quem ainda não fechou', () => {
    expect(hasDismissedFirstSteps(undefined, 10016)).toBe(false);
    expect(hasDismissedFirstSteps('', 10016)).toBe(false);
  });

  it('lembra quem fechou, por Conta', () => {
    const value = firstStepsCookie(undefined, 10016).split(';')[0]?.split('=')[1];
    expect(hasDismissedFirstSteps(value, 10016)).toBe(true);
    expect(hasDismissedFirstSteps(value, 10019)).toBe(false);
  });

  it('acumula Contas no mesmo navegador sem repetir, a mais recente por último', () => {
    const first = firstStepsCookie(undefined, 10016).split(';')[0]?.split('=')[1];
    const second = firstStepsCookie(first, 10019).split(';')[0]?.split('=')[1];
    expect(firstStepsCookie(second, 10016)).toContain(`${FIRST_STEPS_COOKIE}=10019.10016;`);
  });

  it('guarda só as últimas Contas', () => {
    let value: string | undefined;
    for (let id = 1; id <= 30; id++) {
      value = firstStepsCookie(value, id).split(';')[0]?.split('=')[1];
    }
    expect(hasDismissedFirstSteps(value, 30)).toBe(true);
    expect(hasDismissedFirstSteps(value, 1)).toBe(false);
  });

  it('o cookie vale para o site todo e dura um ano', () => {
    expect(firstStepsCookie(undefined, 1)).toBe(
      `${FIRST_STEPS_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`,
    );
  });

  it('ignora lixo no cookie', () => {
    expect(hasDismissedFirstSteps('abc.10016.-1', 10016)).toBe(true);
    expect(firstStepsCookie('abc.x', 7)).toContain('=7;');
  });
});
