import { onRequest as handleApi } from '../functions/api/v1/[[path]].js';

const COMPOSER_SPACING_STYLE =
  '<style id="yinghuo-chat-composer-spacing-fix">.conversation-composer{margin:0;width:100%;padding-top:8px;padding-right:max(8px,env(safe-area-inset-right));padding-bottom:calc(8px + env(safe-area-inset-bottom));padding-left:max(8px,env(safe-area-inset-left))}</style>';

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

    if (
      url.pathname === '/' ||
      url.pathname === '/index.html' ||
      url.pathname.startsWith('/pages/')
    ) {
      const headers = new Headers(request.headers);
      headers.delete('if-none-match');
      headers.delete('if-modified-since');
      headers.delete('range');
      const response = await env.ASSETS.fetch(new Request(url, { method: 'GET', headers }));
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
        return response;
      }

      const responseHeaders = new Headers(response.headers);
      for (const name of [
        'content-length',
        'content-encoding',
        'content-md5',
        'etag',
        'last-modified',
        'accept-ranges',
      ]) {
        responseHeaders.delete(name);
      }
      responseHeaders.set('cache-control', 'no-cache, max-age=0, must-revalidate');
      const html = await response.text();
      const patchedHtml = html.includes('yinghuo-chat-composer-spacing-fix')
        ? html
        : html.replace('</head>', `${COMPOSER_SPACING_STYLE}</head>`);
      return new Response(request.method === 'HEAD' ? null : patchedHtml, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
