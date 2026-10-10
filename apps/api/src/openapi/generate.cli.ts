import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { buildOpenApiDocument } from './openapi.js';

// Em modo preview nenhuma conexão é aberta; as URLs só precisam passar na validação.
const config = loadConfig({
  DATABASE_URL: 'postgres://openapi@localhost/openapi',
  VALKEY_URL: 'redis://localhost:6379',
});
const app = await createApp(config, { preview: true });
const document = buildOpenApiDocument(app);
await app.close();

const output = fileURLToPath(new URL('../../openapi.json', import.meta.url));
await writeFile(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(`OpenAPI escrito em ${output}`);
