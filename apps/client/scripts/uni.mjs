import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('@dcloudio/vite-plugin-uni/package.json')), 'bin/uni.js');
// The supported CI flag disables the optional MAC-address/update telemetry probe.
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, CI: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
