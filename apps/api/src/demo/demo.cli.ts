import { demoSettings } from './demo-guard.js';
import { assertHomologation } from './demo-media.js';

// Só na homologação (demo-guard.ts). Na imagem: node dist/demo/demo.cli.js <seed|simulate>
//   seed      semeia contas, servidores, estatísticas, inventário e loadout fictícios (e sai)
//   simulate  faz de conta que os servidores fictícios jogam: batimentos e partidas pela API
//   media     o armazenamento de mídia de mentira (fotos de perfil), em disco: a porta da API (S3, interna) e a
//             pública (só GET das fotos no ar), ver demo-media.ts
const command = process.argv[2];
const log = (line: string) => console.log(`[demo] ${line}`);

if (command === 'seed') {
  const settings = demoSettings(process.env);
  const { runSeed } = await import('./demo-seed-runner.js');
  await runSeed(settings, log);
  // Sobra algum temporizador de fundo (avatares, Valkey): o seed acabou, o processo também.
  process.exit(0);
} else if (command === 'simulate') {
  const settings = demoSettings(process.env);
  const { simulate } = await import('./demo-simulator.js');
  const stop = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop.abort());
  await simulate(
    {
      apiUrl: (process.env.DEMO_API_URL ?? 'http://api:3333').replace(/\/+$/, ''),
      secret: settings.secret,
      log,
    },
    stop.signal,
  );
} else if (command === 'media') {
  assertHomologation(process.env);
  const { MediaStore } = await import('./demo-media.js');
  const need = (name: string) => {
    const value = (process.env[name] ?? '').trim();
    if (value === '') throw new Error(`${name} não definida`);
    return value;
  };
  const store = new MediaStore({
    root: process.env.MEDIA_ROOT || '/media-data',
    publicBucket: need('R2_MEDIA_PUBLIC_BUCKET'),
    privateBucket: need('R2_MEDIA_PRIVATE_BUCKET'),
    accessKeyId: need('R2_MEDIA_ACCESS_KEY_ID'),
  });
  const ports = await store.listen({ api: 9000, public: 8080 });
  log(`mídia de mentira no ar: API ${ports.api}, pública ${ports.public}`);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => void store.close().then(() => process.exit(0)));
  }
} else {
  console.error('Uso: demo.cli.js <seed|simulate|media>');
  process.exitCode = 1;
}
