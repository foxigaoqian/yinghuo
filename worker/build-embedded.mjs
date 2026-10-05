import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = resolve('apps/client/dist/build/h5');
const output = resolve('.worker-release');
mkdirSync(output, { recursive: true });
const items = [];
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
function collect(dir) {
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, file.name);
    if (file.isDirectory()) collect(full);
    else if (!file.name.endsWith('.map') && file.name !== 'atlas.png')
      items.push(['/' + relative(root, full), readFileSync(full)]);
  }
}
collect(root);
if (!items.some(([path]) => path === '/admin/index.html'))
  items.push(['/admin/index.html', readFileSync('worker/admin.html')]);
const parts = [];
let part = {};
let size = 0;
for (const [path, content] of items) {
  const item = {
    type: types[path.slice(path.lastIndexOf('.'))] || 'application/octet-stream',
    hash: createHash('sha256').update(content).digest('hex').slice(0, 24),
    body: gzipSync(content).toString('base64'),
  };
  if (size + item.body.length > 100_000 && size) {
    parts.push(part);
    part = {};
    size = 0;
  }
  part[path] = item;
  size += item.body.length;
}
parts.push(part);
parts.forEach((value, index) =>
  writeFileSync(
    join(output, `assets-${index}.js`),
    'export default ' + JSON.stringify(value) + ';',
  ),
);
writeFileSync(
  join(output, 'assets.js'),
  parts.map((_, i) => `import p${i} from './assets-${i}.js';`).join('\n') +
    '\nexport default Object.assign({},' +
    parts.map((_, i) => `p${i}`).join(',') +
    ');',
);
console.log(
  JSON.stringify({
    assets: items.length,
    parts: parts.length,
    encodedBytes: parts.reduce((n, p) => n + JSON.stringify(p).length, 0),
  }),
);
