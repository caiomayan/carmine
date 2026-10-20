import { createUnclaimedAccount, signInByRequest } from './accounts';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';

/**
 * Vínculo do Discord (S15) nos ajustes do Perfil. A stack do E2E sobe sem as variáveis DISCORD_*,
 * então a integração está desligada: o botão aparece desabilitado e nada quebra. O fluxo OAuth
 * completo (state, vínculo duplicado, cargos) é coberto pelos testes de integração da API, com o
 * Discord falso.
 */

test('sem a integração configurada, o botão de vincular fica desabilitado e explica', async ({
  page,
  request,
}) => {
  const account = await createUnclaimedAccount(request, 'Jogador Do Discord');
  await signInByRequest(page, account.steamId);
  await page.goto(`/${account.publicId}`);

  const row = page.getByTestId('discord-setting');
  await expect(row).toBeVisible();
  await expect(row.getByRole('heading', { name: 'Discord' })).toBeVisible();
  await expect(page.getByTestId('discord-link-disabled')).toBeDisabled();
  await expect(row).toContainText('O vínculo com o Discord não está disponível agora.');
  await expect(page.getByTestId('discord-link')).toHaveCount(0);
});

test('o resultado do vínculo volta na URL, aparece como aviso e a URL é limpa', async ({
  page,
  request,
}) => {
  const account = await createUnclaimedAccount(request, 'Jogador Do Discord Dois');
  await signInByRequest(page, account.steamId);

  await page.goto(`/${account.publicId}?discord=em-uso`);

  const notice = page.getByTestId('discord-notice');
  await expect(notice).toContainText('Esse Discord já está ligado a outra Conta do Carmine.');
  await expect(notice).toContainText('Entre nessa Conta e desvincule');
  await expect(page).toHaveURL(new RegExp(`/${account.publicId}$`));

  // Um valor que a API nunca manda é ignorado.
  await page.goto(`/${account.publicId}?discord=qualquer-coisa`);
  await expect(page.getByTestId('discord-setting')).toBeVisible();
  await expect(page.getByTestId('discord-notice')).toHaveCount(0);
});

for (const theme of ['dark', 'light'] as const) {
  test(`vínculo do Discord sem violações do axe e sem scroll horizontal (${theme})`, async ({
    page,
    request,
  }) => {
    await saveTheme(page, theme);
    const account = await createUnclaimedAccount(request, 'Nome De Exibição Bem Comprido Mesmo');
    await signInByRequest(page, account.steamId);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${account.publicId}?discord=conta-ja-vinculada`);
      await expect(page.getByTestId('discord-notice')).toBeVisible();
      expect(await axeViolations(page), `${width}px`).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px`).toBe(0);
    }
  });
}
