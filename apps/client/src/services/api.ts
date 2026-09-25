import type { ApiError } from '@yinghuo/contracts';
let csrfToken: string | null = null;
export function setCsrf(token: string | null) {
  csrfToken = token;
}
export async function api<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  data?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  // H5-only transport. Replace here, not in pages, when migrating to mini-program.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
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
    const body = await response.json();
    if (!response.ok) throw new Error((body as ApiError)?.error?.message || '请求失败，请稍后重试');
    return body as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError'))
      throw new Error('暂时连接不上服务，请确认后端已启动，再试一次。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export const requestKey = () => globalThis.crypto.randomUUID();
