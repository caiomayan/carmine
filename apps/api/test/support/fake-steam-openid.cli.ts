/**
 * Steam falsa para desenvolvimento local e o E2E do web: o login funciona sem a Steam real (e
 * sem internet), e a mesma porta responde a Steam Web API.
 *
 *   pnpm --filter @carmine/api fake-steam [steamId64]
 *
 * - OpenID: toda visita a "Entrar com a Steam" entra direto como o SteamID escolhido. No
 *   apps/api/.env: STEAM_OPENID_URL=http://127.0.0.1:4555/openid/login
 * - Steam Web API (STEAM_WEB_API_URL=http://127.0.0.1:4555 e STEAM_WEB_API_KEY com qualquer
 *   valor): nenhum perfil existe (avatar neutro) e as amizades seguem `e2eFriendList`
 *   (fake-steam.ts): ...0001 a ...0999 são amigos de todos; 76561198000009001 tem a lista
 *   privada e 76561198000009002 faz a Steam falhar.
 *
 * Nunca aponte uma API de produção para cá (a config exige https em produção).
 */
import { steamId64Schema } from '@carmine/contracts';
import { e2eFriendList, FakeSteam } from './fake-steam.ts';
import { FakeSteamOpenId } from './fake-steam-openid.ts';

const port = Number(process.env.FAKE_STEAM_PORT ?? 4555);
const steamId = steamId64Schema.parse(process.argv[2] ?? '76561198000000001');

const fake = await FakeSteamOpenId.start(port);
fake.steamId = steamId;
const webApi = new FakeSteam();
webApi.profilesExist = false;
webApi.friendsOf = e2eFriendList;
fake.otherRequests = webApi.handle;
console.log(`Steam OpenID falsa em ${fake.endpoint}; todo login entra como ${steamId}.`);
console.log(`No apps/api/.env: STEAM_OPENID_URL=${fake.endpoint}`);
console.log(`Steam Web API falsa na mesma porta: STEAM_WEB_API_URL=http://127.0.0.1:${port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void fake.stop().then(() => process.exit(0)));
}
