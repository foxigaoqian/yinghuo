import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const release = '20261017-chat-spacing';
const indexPath = resolve('dist/build/h5/index.html');
const html = await readFile(indexPath, 'utf8');
const assetNames = await readdir(resolve('dist/build/h5/assets'));
const appScreenAsset = assetNames.find(
  (name) => name.startsWith('AppScreen.vue_vue_type_script_setup_true_lang.') && name.endsWith('.js'),
);
const preloadLinks = [
  appScreenAsset
    ? `<link rel="modulepreload" crossorigin href="/assets/${appScreenAsset}">`
    : '',
  '<link rel="preload" as="image" href="/static/atlas.webp" type="image/webp">',
]
  .filter(Boolean)
  .join('\n    ');
const next = html.replace(
  /href="(\/assets\/[^"]+\.css)"/g,
  (_match, path) => `href="${path}?v=${release}"`,
).replace('</head>', `    ${preloadLinks}\n  </head>`);

await writeFile(indexPath, next);
await mkdir(resolve('dist/build/h5/admin'), { recursive: true });
await copyFile(resolve('../../worker/admin.html'), resolve('dist/build/h5/admin/index.html'));
