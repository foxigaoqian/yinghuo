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
  if (env.AI_PROVIDER === 'openai_compatible') {
    if (mode !== 'supabase') throw new Error('Live AI requires APP_MODE=supabase');
    if (!env.AI_API_KEY || !env.AI_MODEL || !env.AI_BASE_URL)
      throw new Error('Live AI requires AI_BASE_URL, AI_API_KEY and AI_MODEL');
    const url = new URL(env.AI_BASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('AI_BASE_URL must use HTTPS without embedded credentials');
  }
  for (const name of [
    'SMS_PROVIDER',
    'AI_PROVIDER',
    'PHOTO_PROVIDER',
    'PAYMENT_PROVIDER',
    'MODERATION_PROVIDER',
  ]) {
    if (env[name] && env[name] !== 'mock' && !(name === 'AI_PROVIDER' && env[name] === 'openai_compatible'))
      throw new Error(name + ': live adapter not implemented; keep mock.');
  }
  const port = Number(env.API_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT');
}
