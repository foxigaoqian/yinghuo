import type { ApiError } from '@yinghuo/contracts';
let csrfToken: string | null = null;
export class ApiRequestError extends Error {
  requestId: string;
  code: string;
  constructor(message: string, requestId = '', code = '') {
    super(message);
    this.name = 'ApiRequestError';
    this.requestId = requestId;
    this.code = code;
  }
}
export function setCsrf(token: string | null) {
  csrfToken = token;
}
export async function api<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  data?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  // H5-only transport. Replace here, not in pages, when migrating to mini-program.
  const controller = new AbortController();
  const timeoutMs = method === 'POST' && path.endsWith('/messages') ? 60_000 : 15_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/v1' + path, {
      method,
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const apiError = body as ApiError & { requestId?: string };
      throw new ApiRequestError(
        apiError?.error?.message || '请求失败，请稍后重试',
        apiError?.requestId || response.headers.get('x-request-id') || '',
        apiError?.error?.code || '',
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError'))
      throw new Error('暂时无法连接，请检查网络后重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export const requestKey = () => globalThis.crypto.randomUUID();
