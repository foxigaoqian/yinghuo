import { config } from 'dotenv';
import { resolve } from 'node:path';
export function loadEnvironment() {
  config({ path: resolve(__dirname, '../../../.env'), quiet: true });
}
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.APP_MODE || 'demo';
  if (!['demo', 'supabase'].includes(mode)) throw new Error('APP_MODE must be demo or supabase');
  if (env.NODE_ENV === 'production')
    throw new Error(
      'Production launch is blocked until real AI, SMS, media and payment providers pass acceptance tests.',
    );
  if (mode === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
      throw new Error('Supabase mode requires SUPABASE_URL and SUPABASE_SECRET_KEY on the server.');
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
      throw new Error('Supabase mode requires a SESSION_SECRET of at least 32 characters.');
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
