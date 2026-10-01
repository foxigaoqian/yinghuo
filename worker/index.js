import { onRequest as handleApi } from '../functions/api/v1/[[path]].js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/v1/')) {
      return handleApi({ request, env });
    }

    return env.ASSETS.fetch(request);
  },
};
