import type { AnalyticsConfig } from '../config/config.js';
import { type AnalyticsTransport, LogTransport } from './analytics-transport.js';
import { PostHogTransport } from './posthog-transport.js';

/** O transporte do ambiente: PostHog (UE) ligado, só log (homologação) ou nenhum (sem chave, como o Discord). */
export function createAnalyticsTransport(config: AnalyticsConfig): AnalyticsTransport | null {
  if (config.mode === 'log') return new LogTransport();
  if (config.mode === 'posthog' && config.posthog) return new PostHogTransport(config.posthog);
  return null;
}
