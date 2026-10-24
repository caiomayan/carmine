import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Espera o React assumir o elemento. O HTML do servidor já mostra o botão, mas só depois da
 * hidratação ele tem o `onClick`; um clique antes cai num HTML morto, não faz nada e o teste só
 * falha lá na frente, sem pista do motivo. No `next dev`, que compila a página sob demanda, a
 * janela entre o HTML e a hidratação é de segundos. O React marca cada nó que adotou com
 * `__reactProps$…`, então basta ver a marca: nenhum atributo de teste entra no app.
 */
export async function hydrated(locator: Locator) {
  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith('__reactProps$')),
        ),
      { message: 'o React ainda não hidratou o elemento' },
    )
    .toBe(true);
}

/** Clica depois de o elemento hidratar (ver `hydrated`). */
export async function clickHydrated(locator: Locator) {
  await hydrated(locator);
  await locator.click();
}

/** Abre o menu da Conta e espera ele aparecer (o gatilho só abre depois de hidratar). */
export async function openAccountMenu(page: Page) {
  await clickHydrated(page.getByTestId('account-menu'));
  await expect(page.getByRole('menu')).toBeVisible();
}

/**
 * Preenche um campo depois de hidratar e confere o valor: o campo controlado pelo React perde o
 * que se digita antes de a página hidratar.
 */
export async function fillHydrated(field: Locator, value: string) {
  await hydrated(field);
  await field.fill(value);
  await expect(field).toHaveValue(value);
}
