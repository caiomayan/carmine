import { chooseSteamAccount, newSteamId } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';
import {
  connectPlayer,
  createServer,
  fakeServer,
  friendSteamId,
  heartbeat,
  keepBeating,
  routeLiveServers,
} from './live-servers';

/** Mesmos SteamIDs da Steam falsa da API (apps/api/test/support/fake-steam.ts). */
const PRIVATE_FRIENDS_STEAM_ID = '76561198000009001';
const FRIENDS_ERROR_STEAM_ID = '76561198000009002';

const row = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`[data-testid="server-row"][data-server="${name}"]`);

/** Entra pela Steam falsa e volta para a home. */
async function signIn(page: import('@playwright/test').Page, steamId: string) {
  await chooseSteamAccount(page.context(), steamId);
  await page.goto('/entrar');
  await page.getByTestId('steam-login').click();
  await page.waitForURL('/');
}

test.describe('Servidores ao vivo', () => {
  test('um jogador entra e o contador muda sem recarregar a página', async ({ page, request }) => {
    const server = createServer();
    const first = newSteamId();
    const players = [first];
    await connectPlayer(request, server, first, 'Primeiro');
    const stop = keepBeating(request, server, () => players);
    try {
      await heartbeat(request, server, players);
      await page.goto('/');
      const line = row(page, server.name);
      await expect(line).toHaveAttribute('data-state', 'online');
      await expect(line.getByText('1 de 9 jogadores')).toBeAttached();
      await page.evaluate(() => {
        (window as unknown as { __semRecarregar: boolean }).__semRecarregar = true;
      });

      const second = newSteamId();
      await connectPlayer(request, server, second, 'Segundo');
      players.push(second);
      await expect(line.getByText('2 de 9 jogadores')).toBeAttached({ timeout: 15_000 });
      expect(
        await page.evaluate(
          () => (window as unknown as { __semRecarregar?: boolean }).__semRecarregar,
        ),
      ).toBe(true);
      // O resumo do alto da lista e o do rodapé acompanham o mesmo ao vivo.
      await expect(page.getByTestId('live-status')).toHaveAttribute('data-connection', 'live');
    } finally {
      stop();
    }
  });

  test('um servidor sem batimento fica offline e Conectar desabilita', async ({
    page,
    request,
  }) => {
    const server = createServer();
    const stop = keepBeating(request, server, () => []);
    await heartbeat(request, server, []);
    await page.goto('/');
    const line = row(page, server.name);
    await expect(line).toHaveAttribute('data-state', 'online');
    await expect(line.getByRole('link', { name: `Conectar ao ${server.name}` })).toBeVisible();

    stop();
    // No E2E a API marca offline com 4 s sem batimento (SERVER_OFFLINE_AFTER_SECONDS).
    await expect(line).toHaveAttribute('data-state', 'offline', { timeout: 20_000 });
    await expect(line.getByText('Offline', { exact: true })).toBeVisible();
    await expect(line.getByRole('button', { name: 'Conectar' })).toBeDisabled();
    await expect(line.getByRole('link', { name: /Conectar/ })).toHaveCount(0);
    await expect(line.getByText('Sem mapa')).toBeVisible();
  });

  test.describe('Conectar', () => {
    test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

    test('abre steam://connect e mostra o IP copiável com o comando do console', async ({
      page,
      request,
      expectedConsoleErrors,
    }) => {
      // O Chrome do teste não tem a Steam: o steam:// não abre (é justamente o caso do IP).
      expectedConsoleErrors.push(/steam:\/\//);
      const server = createServer();
      const stop = keepBeating(request, server, () => []);
      try {
        await heartbeat(request, server, []);
        await page.goto('/');
        const line = row(page, server.name);
        const connect = line.getByRole('link', { name: `Conectar ao ${server.name}` });
        await expect(connect).toHaveAttribute('href', `steam://connect/${server.address}`);
        await expect(line.getByTestId('server-address')).toHaveText(server.address);

        await connect.click();
        const help = line.getByRole('status');
        await expect(help).toContainText('Abrindo o CS2.');
        await expect(help).toContainText(`no console do CS2: connect ${server.address}`);

        await line.getByTestId('copy-command').click();
        await expect(line.getByTestId('copy-command')).toHaveText('IP copiado');
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(server.address);

        await line.getByRole('button', { name: 'Fechar instrução' }).click();
        await expect(line.getByTestId('copy-command')).toHaveCount(0);

        // O botão de copiar ao lado de Conectar também abre a instrução, sem o "Abrindo".
        await line.getByRole('button', { name: `Copiar o IP do ${server.name}` }).click();
        await expect(line.getByRole('status')).toContainText(`connect ${server.address}`);
        await expect(line.getByRole('status')).not.toContainText('Abrindo');
      } finally {
        stop();
      }
    });
  });

  test.describe('no celular', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    test('mostra só o IP e a instrução de abrir no PC', async ({ page }) => {
      const server = fakeServer({ name: 'fixo-celular', address: '203.0.113.9:27015' });
      await routeLiveServers(page, [server]);
      await page.goto('/');
      const line = row(page, 'fixo-celular');
      await expect(page.getByText(/No celular não dá para jogar: abra o CS2 no PC/)).toBeVisible();
      await expect(line.getByRole('link', { name: /Conectar/ })).toBeHidden();
      await expect(line.getByTestId('server-address')).toHaveText('203.0.113.9:27015');

      const copy = line.getByRole('button', { name: 'Copiar o IP do fixo-celular' }).last();
      await expect(copy).toBeVisible();
      await copy.click();
      await expect(copy).toContainText('IP copiado');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('203.0.113.9:27015');
    });
  });

  test('o filtro por Modo tem estado vazio e volta para todos', async ({ page }) => {
    await routeLiveServers(page, [
      fakeServer({ name: 'fixo-retake' }),
      fakeServer({ name: 'fixo-lotado', state: 'full', players: 9 }),
    ]);
    await page.goto('/');
    await expect(row(page, 'fixo-retake')).toBeVisible();
    await expect(row(page, 'fixo-lotado').getByText('Lotado', { exact: true })).toBeVisible();

    const tabs = page.getByRole('tablist', { name: 'Modo' });
    await tabs.getByRole('tab', { name: 'Deathmatch' }).click();
    await expect(page.getByText('Nenhum servidor de Deathmatch por enquanto')).toBeVisible();
    await page.getByRole('button', { name: 'Ver todos os servidores' }).click();
    await expect(tabs.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true');
    await expect(row(page, 'fixo-retake')).toBeVisible();
  });

  test('o rodapé usa o resumo real e acompanha o ao vivo', async ({ page }) => {
    await routeLiveServers(page, [
      fakeServer({ players: 5 }),
      fakeServer({ players: 2 }),
      fakeServer({ state: 'offline', players: 0, map: null }),
    ]);
    await page.goto('/');
    const status = page.getByRole('status', { name: 'Estado dos servidores' });
    // O que o leitor de tela ouve (os rolos de dígitos do contador são decorativos).
    await expect
      .poll(async () => (await status.ariaSnapshot()).replace(/\s+/g, ' '))
      .toMatch(/Ao vivo 2 servidores online 7 jogadores/);
  });

  test('quando a conexão ao vivo cai, fica o último estado com "atualizado há X s" e ela volta sozinha', async ({
    page,
    expectedConsoleErrors,
  }) => {
    expectedConsoleErrors.push(/api\/servers\/live.*503|503.*api\/servers\/live/);
    await routeLiveServers(page, [fakeServer({ name: 'fixo-queda', players: 6 })], {
      failAfter: 1,
    });
    await page.goto('/');
    const status = page.getByTestId('live-status');
    const line = row(page, 'fixo-queda');
    await expect(line.getByText('6 de 9 jogadores')).toBeAttached();

    await expect(status).toHaveAttribute('data-connection', 'lost');
    await expect(status).toContainText('Reconectando');
    await expect(page.getByTestId('live-updated')).toHaveText(/atualizado há \d+ s/);
    const first = Number((await page.getByTestId('live-updated').innerText()).match(/\d+/)?.[0]);
    await expect
      .poll(async () =>
        Number((await page.getByTestId('live-updated').innerText()).match(/\d+/)?.[0]),
      )
      .toBeGreaterThan(first);
    // O último estado conhecido continua na tela, e o aviso vai para o leitor de tela uma vez.
    await expect(line.getByText('6 de 9 jogadores')).toBeAttached();
    await expect(status.getByRole('status')).toHaveText(/A conexão ao vivo caiu/);

    // A API volta (o stream real): a reconexão automática traz a lista de novo e a contagem some.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await expect(status).toHaveAttribute('data-connection', 'live', { timeout: 40_000 });
    await expect(page.getByTestId('live-updated')).toHaveCount(0);
    await expect(status.getByRole('status')).toHaveText('Conexão ao vivo de volta.');
    await expect(line).toHaveCount(0);
  });
});

test.describe('Seus amigos jogando agora', () => {
  test('um amigo Steam conectado aparece no bloco e "Entrar" abre o mesmo servidor', async ({
    page,
    request,
  }) => {
    const server = createServer();
    const friend = friendSteamId();
    await connectPlayer(request, server, friend, 'Amigo do E2E');
    const stop = keepBeating(request, server, () => [friend]);
    try {
      await heartbeat(request, server, [friend]);
      await signIn(page, newSteamId());
      const block = page.getByTestId('friends-playing');
      await expect(block).toHaveAttribute('data-status', 'ok');
      // Outros testes podem ter amigos jogando ao mesmo tempo: abre a lista inteira.
      const more = block.getByRole('button', { name: /Ver mais/ });
      if (await more.isVisible()) await more.click();
      const entry = block.locator(`[data-friend="${friend}"]`);
      await expect(entry).toBeVisible();
      await expect(entry).toContainText(server.name);
      await expect(
        entry.getByRole('link', { name: /^Entrar no mesmo servidor que / }),
      ).toHaveAttribute('href', `steam://connect/${server.address}`);
    } finally {
      stop();
    }
  });

  test('nenhum amigo jogando tem o seu estado', async ({ page }) => {
    // A Steam falsa faz todo mundo amigo de …0001 a …0999, e outros testes ligam amigos em
    // paralelo: a resposta "ok, nenhum" vem fixa. A leitura real é coberta pela API.
    await page.route('**/api/me/friends-playing', (route) =>
      route.fulfill({ json: { status: 'ok', friends: [] } }),
    );
    await signIn(page, newSteamId());
    const block = page.getByTestId('friends-playing');
    await expect(block).toHaveAttribute('data-status', 'ok');
    await expect(block.getByText('Nenhum amigo jogando agora')).toBeVisible();
  });

  test('lista de amigos privada orienta, com a consequência de privacidade', async ({ page }) => {
    await signIn(page, PRIVATE_FRIENDS_STEAM_ID);
    const block = page.getByTestId('friends-playing');
    await expect(block).toHaveAttribute('data-status', 'private');
    await expect(block.getByText('Sua lista de amigos da Steam é privada')).toBeVisible();

    const howTo = block.getByRole('button', { name: 'Como deixar a lista visível' });
    await expect(howTo).toHaveAttribute('aria-expanded', 'false');
    await howTo.click();
    await expect(howTo).toHaveAttribute('aria-expanded', 'true');
    await expect(block.getByText(/qualquer pessoa vê os seus amigos/)).toBeVisible();
    await expect(block.getByRole('link', { name: 'Abrir a privacidade na Steam' })).toHaveAttribute(
      'href',
      'https://steamcommunity.com/my/edit/settings',
    );
    expect(await axeViolations(page)).toEqual([]);
  });

  test('Steam indisponível tem o seu estado e "Tentar agora"', async ({ page }) => {
    await signIn(page, FRIENDS_ERROR_STEAM_ID);
    const block = page.getByTestId('friends-playing');
    await expect(block).toHaveAttribute('data-status', 'unavailable');
    await expect(block.getByText('A Steam não respondeu')).toBeVisible();
    await expect(block.getByRole('button', { name: 'Tentar agora' })).toBeVisible();
  });

  test('sem sessão, o bloco convida a entrar com a Steam', async ({ page }) => {
    await page.goto('/');
    const block = page.getByTestId('friends-playing');
    await expect(block).toHaveAttribute('data-status', 'anonymous');
    await expect(block.getByRole('link', { name: 'Entrar com a Steam' })).toBeVisible();
  });
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe sem violações na home com servidores e amigos (${theme})`, async ({
    page,
    request,
  }) => {
    await saveTheme(page, theme);
    const server = createServer();
    const friend = friendSteamId();
    await connectPlayer(request, server, friend, 'Amigo axe');
    await heartbeat(request, server, [friend]);
    await signIn(page, newSteamId());
    await expect(page.getByTestId('friends-playing')).toHaveAttribute('data-status', 'ok');
    await expect(row(page, server.name)).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
}
