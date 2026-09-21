import { config } from 'dotenv';
import { resolve } from 'node:path';
export function loadEnvironment() {
  config({ path: resolve(__dirname, '../../../.env'), quiet: true });
}
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === 'production' || (env.APP_MODE && env.APP_MODE !== 'demo')) {
    throw new Error(
      'This scaffold supports LOCAL DEMO ONLY. Live providers, database authorization and launch checks are not implemented.',
    );
  }
  for (const name of [
    'SMS_PROVIDER',
    'AI_PROVIDER',
    'PHOTO_PROVIDER',
    'PAYMENT_PROVIDER',
    'MODERATION_PROVIDER',
  ]) {
    if (env[name] && env[name] !== 'mock')
      throw new Error(name + ': live adapter not implemented; keep mock.');
  }
  const port = Number(env.API_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT');
}
