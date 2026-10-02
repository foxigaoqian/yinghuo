const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Worker keeps H5 assets and API on one origin', async () => {
  const previousFetch = global.fetch;
  const upstreamCalls = [];
  global.fetch = async (url, options) => {
    upstreamCalls.push({ url: String(url), options });
    return Response.json({ status: 'ok', database: 'connected' });
  };

  try {
    const { default: worker } = await import('../worker/index.js');
    const assetCalls = [];
    const env = {
      ASSETS: {
        async fetch(request) {
          assetCalls.push(request.url);
          return new Response('<title>萤火</title>', {
            headers: { 'content-type': 'text/html' },
          });
        },
      },
      SUPABASE_EDGE_SHARED_SECRET: 'test-edge-token',
      SESSION_SECRET: 'x'.repeat(48),
      AI: { run() {} },
    };

    const page = await worker.fetch(new Request('https://stage.example.com/memory-space'), env);
    assert.equal(page.status, 200);
    assert.equal(assetCalls.length, 1);

    const health = await worker.fetch(
      new Request('https://stage.example.com/api/v1/health'),
      env,
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).persistence, 'supabase-edge-gateway');
    assert.equal(assetCalls.length, 1);
    assert.equal(upstreamCalls.length, 1);
    assert.equal(
      upstreamCalls[0].options.headers['x-yinghuo-backend-token'],
      'test-edge-token',
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test('Worker config sends API routes to code before SPA fallback', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', 'wrangler.worker.jsonc'), 'utf8');
  assert.match(config, /"name": "yinghuo-h5-sg-stage"/);
  assert.match(config, /"not_found_handling": "single-page-application"/);
  assert.match(config, /"run_worker_first": \["\/api\/v1\/\*"\]/);
  assert.ok(config.includes('"pattern": "yinghuo.soocly.com"'));
  assert.ok(config.includes('"custom_domain": true'));
  assert.doesNotMatch(config, /SUPABASE_EDGE_SHARED_SECRET\s*":\s*"[^"]+"/);
});
