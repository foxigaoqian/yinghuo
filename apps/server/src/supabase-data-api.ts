export type SupabaseQuery = Record<string, string | number | boolean | undefined>;

export class SupabaseDataApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super('Supabase Data API request failed (' + status + ')');
    this.name = 'SupabaseDataApiError';
  }
}

/** Server-only PostgREST client. Never construct this in the H5 bundle. */
export class SupabaseDataApi {
  private readonly root: URL;

  constructor(
    projectUrl: string,
    private readonly secretKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!projectUrl || !secretKey) throw new Error('Supabase server credentials are required');
    this.root = new URL(projectUrl);
    if (!['https:', 'http:'].includes(this.root.protocol))
      throw new Error('SUPABASE_URL must use HTTPS');
    if (this.root.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(this.root.hostname))
      throw new Error('SUPABASE_URL must use HTTPS outside local development');
    this.root.pathname = this.root.pathname.replace(/\/$/, '');
    this.root.search = '';
    this.root.hash = '';
  }

  select<T>(table: string, query: SupabaseQuery): Promise<T> {
    return this.request<T>(table, 'GET', query);
  }

  insert<T>(table: string, value: unknown, query: SupabaseQuery = {}): Promise<T> {
    return this.request<T>(table, 'POST', query, value, 'return=representation');
  }

  upsert<T>(table: string, value: unknown, conflict: string): Promise<T> {
    return this.request<T>(
      table,
      'POST',
      { on_conflict: conflict },
      value,
      'resolution=merge-duplicates,return=representation',
    );
  }

  patch<T>(table: string, query: SupabaseQuery, value: unknown): Promise<T> {
    return this.request<T>(table, 'PATCH', query, value, 'return=representation');
  }

  rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!/^[a-z][a-z0-9_]{0,62}$/i.test(name)) throw new Error('Invalid Supabase RPC name');
    return this.request<T>('rpc/' + name, 'POST', {}, args, 'return=representation');
  }

  private async request<T>(
    resource: string,
    method: 'GET' | 'POST' | 'PATCH',
    query: SupabaseQuery,
    body?: unknown,
    prefer?: string,
  ): Promise<T> {
    if (!/^[a-z][a-z0-9_]{0,62}$/i.test(resource.split('/')[0]))
      throw new Error('Invalid Supabase resource');
    const url = new URL('/rest/v1/' + resource, this.root);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = {
      apikey: this.secretKey,
      authorization: 'Bearer ' + this.secretKey,
      accept: 'application/json',
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (prefer) headers.prefer = prefer;
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers,
        cache: 'no-store',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new SupabaseDataApiError(503, 'SUPABASE_UNAVAILABLE');
    }
    const text = await response.text();
    if (!response.ok) {
      let code = 'SUPABASE_REQUEST_FAILED';
      try {
        const parsed = JSON.parse(text) as { code?: unknown };
        if (typeof parsed.code === 'string' && /^[A-Z0-9]{4,8}$/.test(parsed.code))
          code = parsed.code;
      } catch {
        // Keep provider error bodies out of logs and user-facing messages.
      }
      throw new SupabaseDataApiError(response.status, code);
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new SupabaseDataApiError(502, 'SUPABASE_INVALID_RESPONSE');
    }
  }
}
