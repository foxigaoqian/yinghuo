import { onRequest as handleApi } from '../functions/api/v1/[[path]].js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/v1/')) {
      return handleApi({ request, env });
    }

    if (/^\/admin\/?$/.test(url.pathname)) {
      url.pathname = '/admin/index.html';
      const response = await env.ASSETS.fetch(new Request(url, request));
      const headers = new Headers(response.headers);
      headers.set('x-robots-tag', 'noindex, nofollow');
      headers.set('cache-control', 'no-cache');
      return new Response(response.body, { status: response.status, headers });
    }
    return env.ASSETS.fetch(request);
  },
};
