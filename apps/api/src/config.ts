import { z } from 'zod';

export interface AppConfig {
  readonly port: number;
  /** Simulator controls over HTTP. Off unless DEV_TOOLS=true, and never in production. */
  readonly devTools: boolean;
  readonly seedDemoData: boolean;
  readonly providerTimeoutMs: number;
}

const portSchema = z.coerce.number().int().min(1).max(65_535);
const timeoutSchema = z.coerce.number().int().min(10).max(60_000);

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    port: portSchema.parse(env['PORT'] ?? 3000),
    devTools: env['DEV_TOOLS'] === 'true' && env['NODE_ENV'] !== 'production',
    seedDemoData: env['SEED_DEMO_DATA'] !== 'false',
    providerTimeoutMs: timeoutSchema.parse(env['PROVIDER_TIMEOUT_MS'] ?? 3000),
  };
}
