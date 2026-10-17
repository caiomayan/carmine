import { init as initSentry } from '@sentry/node';
import { createApp } from './app.js';
import { loadConfig } from './config/config.js';
import { sentryOptions } from './sentry/sentry-options.js';

const config = loadConfig(process.env);
const sentry = sentryOptions(config.sentry);
if (sentry) initSentry(sentry);
const app = await createApp(config);
await app.listen(config.port, config.host);
