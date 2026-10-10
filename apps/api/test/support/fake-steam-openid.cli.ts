/**
 * Steam OpenID falsa para desenvolvimento local: o login do web funciona sem a Steam real
 * (e sem internet). Toda visita a "Entrar com a Steam" entra direto como o SteamID escolhido.
 *
 *   pnpm --filter @carmine/api fake-steam [steamId64]
 *
 * E no apps/api/.env: STEAM_OPENID_URL=http://127.0.0.1:4555/openid/login
 * Nunca aponte uma API de produção para cá (a config exige https em produção).
 */
import { steamId64Schema } from '@carmine/contracts';
import { FakeSteamOpenId } from './fake-steam-openid.ts';

const port = Number(process.env.FAKE_STEAM_PORT ?? 4555);
const steamId = steamId64Schema.parse(process.argv[2] ?? '76561198000000001');

const fake = await FakeSteamOpenId.start(port);
fake.steamId = steamId;
console.log(`Steam OpenID falsa em ${fake.endpoint}; todo login entra como ${steamId}.`);
console.log(`No apps/api/.env: STEAM_OPENID_URL=${fake.endpoint}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void fake.stop().then(() => process.exit(0)));
}
