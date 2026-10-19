import { onRequest as api } from '../functions/api/v1/[[path]].js';
import assets from '../.worker-release/assets.js';
const decoded = new Map();
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/v1/')) return api({ request, env });
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method Not Allowed', { status: 405 });
    const path = /^\/admin\/?$/.test(url.pathname)
      ? '/admin/index.html'
      : assets[url.pathname]
        ? url.pathname
        : url.pathname.split('/').pop().includes('.')
          ? url.pathname
          : '/index.html';
    const item = assets[path];
    if (!item) return new Response('Not Found', { status: 404 });
    const headers = new Headers({
      'content-type': item.type,
      'content-encoding': 'gzip',
      vary: 'accept-encoding',
      etag: `"${item.hash}"`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'cache-control': path.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-yinghuo-release': '20261019-account-layout-v2',
    });
    if (path.startsWith('/admin')) headers.set('x-robots-tag', 'noindex, nofollow');
    if (request.headers.get('if-none-match') === `"${item.hash}"`)
      return new Response(null, { status: 304, headers });
    if (!decoded.has(path))
      decoded.set(
        path,
        Uint8Array.from(atob(item.body), (c) => c.charCodeAt(0)),
      );
    return new Response(request.method === 'HEAD' ? null : decoded.get(path), {
      headers,
      encodeBody: 'manual',
    });
  },
};
