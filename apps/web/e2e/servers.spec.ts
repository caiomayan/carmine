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

/**
 * O servidor na home, seja cartão, linha da lista ou linha offline: a quantidade de servidores
 * no ar decide o desenho, e os E2E de outros arquivos deixam servidores ligados em paralelo.
 */
const row = (page: import('@playwright/test').Page, name: string) =>
  page.locator(`li[data-server="${name}"]`);

/** O grupo "Offline (n)" nasce recolhido com muitos servidores offline: abre antes de olhar. */
async function openOfflineGroup(page: import('@playwright/test').Page) {
  const toggle = page.getByTestId('offline-group').getByRole('button', { name: /^Offline (/ });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

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

  test('um servidor sem batimento sai do cartão e vai para o grupo Offline, sem botão', async ({
    page,
    request,
  }) => {
    const server = createServer();
    const stop = keepBeating(request, server, () => []);
    await heartbeat(request, server, []);
    await page.goto('/');
    const line = row(page, server.name);
    await expect(line).toHaveAttribute('data-state', 'online');
    await expect(line.getByRole('link', { name: `Jogar em ${server.name}` })).toBeVisible();

    stop();
    // No E2E a API marca offline com 4 s sem batimento (SERVER_OFFLINE_AFTER_SECONDS).
    await expect(line).toHaveAttribute('data-state', 'offline', { timeout: 20_000 });
    await openOfflineGroup(page);
    await expect(line).toBeVisible();
    // Sem botão morto: nem "Jogar" desabilitado, nem link; só o motivo, por extenso.
    await expect(line.getByRole('button')).toHaveCount(0);
    await expect(line.getByRole('link')).toHaveCount(0);
    await expect(line.getByText(/^Offline há /)).toBeVisible();
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
        const connect = line.getByRole('link', { name: `Jogar em ${server.name}` });
        await expect(connect).toHaveAttribute('href', `steam://connect/${server.address}`);

        await connect.click();
        const help = line.getByRole('status');
        await expect(help).toContainText('Abrindo o CS2.');
        await expect(help).toContainText(`no console do CS2: connect ${server.address}`);

        await line.getByTestId('copy-command').click();
        await expect(line.getByTestId('copy-command')).toHaveText('IP copiado');
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(server.address);

        await line.getByRole('button', { name: 'Fechar instrução' }).click();
        await expect(line.getByTestId('copy-command')).toHaveCount(0);

        // O botão de copiar ao lado de Jogar também abre a instrução, sem o "Abrindo".
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
      await expect(line.getByRole('link', { name: /^Jogar em / })).toBeHidden();

      const copy = line.getByRole('button', { name: 'Copiar o IP do fixo-celular' }).last();
      await expect(copy).toBeVisible();
      await copy.click();
      await expect(copy).toContainText('IP copiado');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('203.0.113.9:27015');
      await expect(line.getByRole('status')).toContainText('connect 203.0.113.9:27015');
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
  test('um amigo Steam conectado aparece no bloco e "Jogar junto" abre o mesmo servidor', async ({
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
        entry.getByRole('link', { name: /^Jogar junto: entrar no mesmo servidor que / }),
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

test.describe('Home em cartões (U2)', () => {
  const list = (page: import('@playwright/test').Page) => page.getByTestId('server-list');

  test('até 6 servidores no ar viram cartões com o mapa atual ao fundo', async ({ page }) => {
    await routeLiveServers(page, [
      fakeServer({ name: 'fixo-a', map: 'de_mirage', players: 3 }),
      fakeServer({ name: 'fixo-b', map: 'de_dust2', players: 8, address: '203.0.113.201:27015' }),
      fakeServer({ name: 'fixo-c', map: 'de_inferno', mode: 'deathmatch', players: 0 }),
    ]);
    await page.goto('/');
    await expect(list(page)).toHaveAttribute('data-layout', 'cards');
    await expect(page.getByTestId('server-card')).toHaveCount(3);

    const mirage = row(page, 'fixo-a');
    await expect(mirage.getByRole('heading', { name: 'fixo-a' })).toBeVisible();
    await expect(mirage.getByText('Retake', { exact: true })).toBeVisible();
    await expect(mirage.getByText('Mirage', { exact: true })).toBeVisible();
    await expect(mirage.getByText('3 de 9 jogadores')).toBeAttached();
    await expect(mirage.getByRole('link', { name: 'Jogar em fixo-a' })).toHaveAttribute(
      'href',
      'steam://connect/203.0.113.200:27015',
    );
    // Uma imagem por mapa, em AVIF e WebP, e é a do mapa do servidor.
    await expect(mirage.locator('source[type="image/avif"]')).toHaveAttribute(
      'srcset',
      '/maps/mirage-800.avif 800w, /maps/mirage-1600.avif 1600w',
    );
    await expect(mirage.locator('source[type="image/webp"]')).toHaveAttribute(
      'srcset',
      '/maps/mirage-800.webp 800w, /maps/mirage-1600.webp 1600w',
    );
    await expect(row(page, 'fixo-b').locator('img')).toHaveAttribute('src', /dust2-1600\.webp/);
    // O arquivo existe e carrega (a imagem não está quebrada).
    await expect
      .poll(() =>
        mirage.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
      )
      .toBeGreaterThan(0);
  });

  test('o mapa fora da rotação cai num fundo neutro, sem imagem quebrada', async ({ page }) => {
    await routeLiveServers(page, [fakeServer({ name: 'fixo-sem-arte', map: 'de_vertigo' })]);
    await page.goto('/');
    const card = row(page, 'fixo-sem-arte');
    await expect(card.getByText('Vertigo', { exact: true })).toBeVisible();
    await expect(card.locator('img')).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Jogar em fixo-sem-arte' })).toBeVisible();
  });

  test('um servidor só ocupa a largura toda e não parece vazio', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await routeLiveServers(page, [fakeServer({ name: 'fixo-solo', players: 5 })]);
    await page.goto('/');
    const card = row(page, 'fixo-solo');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    const area = await list(page).boundingBox();
    expect(box?.width).toBeGreaterThan((area?.width ?? 0) - 2);
    expect(box?.height).toBeGreaterThanOrEqual(300);
  });

  test('lotado diz que está lotado e segue com o botão (o VIP entra pela vaga reservada)', async ({
    page,
  }) => {
    await routeLiveServers(page, [fakeServer({ name: 'fixo-cheio', state: 'full', players: 9 })]);
    await page.goto('/');
    const card = row(page, 'fixo-cheio');
    await expect(card.getByText('Lotado', { exact: true })).toBeVisible();
    await expect(card.getByText('Com VIP você entra pela Vaga reservada.')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Jogar em fixo-cheio' })).toBeVisible();
  });

  test('acima de 6 servidores no ar a mesma tela vira lista', async ({ page }) => {
    await routeLiveServers(
      page,
      Array.from({ length: 7 }, (_, i) => fakeServer({ name: `fixo-lista-${i}`, players: i })),
    );
    await page.goto('/');
    await expect(list(page)).toHaveAttribute('data-layout', 'list');
    await expect(page.getByTestId('server-card')).toHaveCount(0);
    await expect(page.getByTestId('server-row')).toHaveCount(7);
    await expect(row(page, 'fixo-lista-6').getByRole('link', { name: /^Jogar em / })).toBeVisible();
  });

  test('os offline encolhem: grupo recolhido, sem botão e sem texto cortado', async ({ page }) => {
    const offline = (n: number, heartbeat: string | null) =>
      fakeServer({
        name: `fixo-off-${n}`,
        state: 'offline',
        players: 0,
        map: null,
        lastHeartbeatAt: heartbeat,
      });
    await routeLiveServers(page, [
      fakeServer({ name: 'fixo-no-ar' }),
      offline(1, new Date(Date.now() - 2 * 3600_000).toISOString()),
      offline(2, null),
      offline(3, null),
    ]);
    await page.goto('/');
    await expect(row(page, 'fixo-no-ar')).toBeVisible();
    const group = page.getByTestId('offline-group');
    const toggle = group.getByRole('button', { name: 'Offline (3)' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 'fixo-off-1')).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, 'fixo-off-1').getByText(/^Offline há 2 horas/)).toBeVisible();
    const never = row(page, 'fixo-off-2').getByText('Nunca ficou online');
    await expect(never).toBeVisible();
    // Sem botão morto (só o do próprio grupo) e sem o texto truncado.
    await expect(group.getByRole('button')).toHaveCount(1);
    expect(await never.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  });

  test('sem nada no ar, diz isso e deixa o grupo offline aberto', async ({ page }) => {
    await routeLiveServers(page, [
      fakeServer({ name: 'fixo-offline', state: 'offline', players: 0, map: null }),
    ]);
    await page.goto('/');
    await expect(page.getByText('Nenhum servidor no ar agora.')).toBeVisible();
    await expect(row(page, 'fixo-offline')).toBeVisible();
  });

  test('os avatares dos amigos aparecem no cartão do servidor onde estão', async ({ page }) => {
    const server = fakeServer({ name: 'fixo-amigos' });
    await routeLiveServers(page, [server, fakeServer({ name: 'fixo-vazio' })]);
    await page.route('**/api/me/friends-playing', (route) =>
      route.fulfill({
        json: {
          status: 'ok',
          friends: ['Ana Souza', 'Beto Lima', 'Caio Reis'].map((displayName, i) => ({
            steamId: `7656119800000010${i}`,
            publicId: 9000 + i,
            displayName,
            avatarUrl: null,
            serverId: server.id,
          })),
        },
      }),
    );
    await signIn(page, newSteamId());
    const friends = row(page, 'fixo-amigos').getByTestId('card-friends');
    await expect(friends).toContainText('Ana Souza e mais 2 estão aqui');
    await expect(friends.getByRole('list', { name: 'Amigos no fixo-amigos' })).toBeVisible();
    await expect(friends.getByRole('img', { name: 'Beto Lima' })).toBeVisible();
    await expect(row(page, 'fixo-vazio').getByTestId('card-friends')).toHaveCount(0);
  });

  test('o Id público não aparece em lugar nenhum da home', async ({ page }) => {
    await routeLiveServers(page, [fakeServer({ name: 'fixo-id' })]);
    await page.goto('/');
    await expect(row(page, 'fixo-id')).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(/#\s?\d/);
  });

  test('no celular não há rolagem horizontal e o cartão cabe na tela', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await routeLiveServers(page, [
      fakeServer({ name: 'fixo-m1', showcaseName: 'Retake · Rotação', code: 'SP·1' }),
      fakeServer({ name: 'fixo-m2', state: 'full', players: 9, map: 'de_dust2' }),
      fakeServer({ name: 'fixo-m3', state: 'offline', players: 0, map: null }),
    ]);
    await page.goto('/');
    await expect(row(page, 'fixo-m1')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await row(page, 'fixo-m1').boundingBox();
    expect(box?.width).toBeLessThanOrEqual(390);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`axe sem violações nos cartões, no lotado e no offline (${theme})`, async ({ page }) => {
      await saveTheme(page, theme);
      await routeLiveServers(page, [
        fakeServer({ name: 'fixo-ax-1', map: 'de_dust2' }),
        fakeServer({ name: 'fixo-ax-2', state: 'full', players: 9, map: 'de_vertigo' }),
        fakeServer({ name: 'fixo-ax-3', state: 'offline', players: 0, map: null }),
      ]);
      await page.goto('/');
      await expect(row(page, 'fixo-ax-1')).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
