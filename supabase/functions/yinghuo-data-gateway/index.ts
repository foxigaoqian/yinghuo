import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const TABLES = new Set([
  'app_users',
  'profiles',
  'profile_preferences',
  'profile_avatars',
  'memories',
  'consents',
  'conversations',
  'messages',
  'private_stories',
  'account_recovery_codes',
  'user_feedback',
  'app_static_assets',
]);
const RPCS = new Set([
  'yinghuo_get_guest_session',
  'yinghuo_create_guest_session',
  'yinghuo_revoke_guest_session',
  'yinghuo_create_profile',
  'yinghuo_set_recovery_code',
  'yinghuo_recover_guest_session',
  'yinghuo_touch_guest_session',
  'yinghuo_delete_account',
  'yinghuo_recover_guest_session_v2',
  'yinghuo_get_app_state',
  'yinghuo_delete_profile',
  'yinghuo_reset_conversation',
]);
const METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);
const PREFER = new Set([
  'return=representation',
  'resolution=merge-duplicates,return=representation',
]);

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function secretKey() {
  const current = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (current) {
    try {
      const keys = JSON.parse(current);
      if (typeof keys.default === 'string' && keys.default.startsWith('sb_secret_')) {
        return keys.default;
      }
    } catch {
      // Fall through to the legacy hosted-function variable.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function supabaseFetch(path: string, key: string, init: RequestInit = {}) {
  const base = Deno.env.get('SUPABASE_URL');
  if (!base || !key) throw new Error('Supabase environment is unavailable');
  return fetch(new URL(path, base), {
    ...init,
    headers: {
      apikey: key,
      accept: 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

const authorizationCache = new Map<string, { expiresAt: number; pending?: Promise<boolean> }>();

async function authorized(request: Request, key: string) {
  const token = (request.headers.get('x-yinghuo-backend-token') || '').trim();
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(token)) return false;
  const base = Deno.env.get('SUPABASE_URL');
  if (!base) return false;
  const hash = await sha256Hex(token);
  const cached = authorizationCache.get(hash);
  if (cached?.expiresAt && cached.expiresAt > Date.now()) return true;
  if (cached?.pending) return cached.pending;
  const pending = (async () => {
    const url = new URL('/rest/v1/backend_service_tokens', base);
    url.searchParams.set('select', 'token_hash');
    url.searchParams.set('token_hash', 'eq.' + hash);
    url.searchParams.set('enabled', 'eq.true');
    url.searchParams.set('limit', '1');
    const response = await supabaseFetch(url.pathname + url.search, key);
    if (!response.ok) return false;
    const rows = await response.json();
    return (
      Array.isArray(rows) &&
      typeof rows[0]?.token_hash === 'string' &&
      constantTimeEqual(rows[0].token_hash, hash)
    );
  })();
  authorizationCache.set(hash, { expiresAt: 0, pending });
  try {
    const ok = await pending;
    if (ok) authorizationCache.set(hash, { expiresAt: Date.now() + 60_000 });
    else authorizationCache.delete(hash);
    return ok;
  } catch (error) {
    authorizationCache.delete(hash);
    throw error;
  }
}

function validResource(resource: unknown) {
  if (typeof resource !== 'string') return false;
  if (resource.startsWith('rpc/')) return RPCS.has(resource.slice(4));
  return TABLES.has(resource);
}

function validQuery(query: unknown): query is Record<string, string | number | boolean> {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return false;
  return Object.entries(query).every(
    ([name, value]) =>
      /^[a-z_][a-z0-9_]*$/.test(name) &&
      ['string', 'number', 'boolean'].includes(typeof value) &&
      String(value).length <= 2_000,
  );
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return json({ error: 'BAD_REQUEST' }, 400);

  const key = secretKey();
  if (!key) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  let isAuthorized = false;
  try {
    isAuthorized = await authorized(request, key);
  } catch {
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }
  if (!isAuthorized) return json({ error: 'UNAUTHORIZED' }, 401);

  const raw = await request.text();
  if (raw.length > 128_000) return json({ error: 'PAYLOAD_TOO_LARGE' }, 413);

  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: 'BAD_REQUEST' }, 400);
  }

  if (input.operation === 'health') {
    return json({ status: 'ok', database: 'connected' });
  }
  if (
    input.operation !== 'database' ||
    !validResource(input.resource) ||
    typeof input.method !== 'string' ||
    !METHODS.has(input.method) ||
    !validQuery(input.query)
  ) {
    return json({ error: 'BAD_REQUEST' }, 400);
  }

  const resource = input.resource as string;
  const method = input.method as string;
  if (
    (resource.startsWith('rpc/') && method !== 'POST') ||
    (input.prefer && !PREFER.has(String(input.prefer)))
  ) {
    return json({ error: 'BAD_REQUEST' }, 400);
  }

  const base = Deno.env.get('SUPABASE_URL');
  if (!base) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  const url = new URL('/rest/v1/' + resource, base);
  for (const [name, value] of Object.entries(
    input.query as Record<string, string | number | boolean>,
  )) {
    url.searchParams.set(name, String(value));
  }

  try {
    const response = await supabaseFetch(url.pathname + url.search, key, {
      method,
      headers: {
        ...(input.data === undefined ? {} : { 'content-type': 'application/json' }),
        ...(input.prefer ? { prefer: String(input.prefer) } : {}),
      },
      ...(input.data === undefined ? {} : { body: JSON.stringify(input.data) }),
    });
    if (!response.ok) return json({ error: 'DATABASE_UNAVAILABLE' }, 502);
    const responseBody = await response.text();
    return new Response(responseBody || null, {
      status: response.status,
      headers,
    });
  } catch {
    return json({ error: 'DATABASE_UNAVAILABLE' }, 502);
  }
});
