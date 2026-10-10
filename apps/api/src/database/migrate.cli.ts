import { pino } from 'pino';
import { loadConfig } from '../config/config.js';
import { runMigrations } from './migrate.js';

const config = loadConfig(process.env);
const logger = pino({ level: config.logLevel, name: 'migrate' });

try {
  await runMigrations(config.databaseUrl);
  logger.info('Migrações aplicadas');
} catch (error) {
  logger.fatal({ err: error }, 'Falha ao aplicar as migrações');
  process.exitCode = 1;
}
