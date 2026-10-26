import { demoSettings } from './demo-guard.js';

// Só na homologação (demo-guard.ts). Na imagem: node dist/demo/demo.cli.js <seed|simulate>
//   seed      semeia contas, servidores, estatísticas, inventário e loadout fictícios (e sai)
//   simulate  faz de conta que os servidores fictícios jogam: batimentos e partidas pela API
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
} else {
  console.error('Uso: demo.cli.js <seed|simulate>');
  process.exitCode = 1;
}
