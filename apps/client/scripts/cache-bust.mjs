import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const release = '20261006-ux';
const indexPath = resolve('dist/build/h5/index.html');
const html = await readFile(indexPath, 'utf8');
const next = html.replace(
  /href="(\/assets\/[^"]+\.css)"/g,
  (_match, path) => `href="${path}?v=${release}"`,
);

await writeFile(indexPath, next);
await mkdir(resolve('dist/build/h5/admin'), { recursive: true });
await copyFile(resolve('../../worker/admin.html'), resolve('dist/build/h5/admin/index.html'));
