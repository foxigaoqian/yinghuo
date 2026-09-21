import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Worker } from 'bullmq';
import { processDemoJob } from './processor';
config({ path: resolve(__dirname, '../../../.env'), quiet: true });
if (
  process.env.NODE_ENV === 'production' ||
  (process.env.APP_MODE && process.env.APP_MODE !== 'demo')
)
  throw new Error('Worker is local demo only');
if (!process.env.REDIS_URL) {
  void processDemoJob({ type: 'photo-restore', mock: true, referenceId: 'self-check' }).then(
    (result) => {
      console.log(
        'Worker self-check:',
        result,
        '\nRedis is not configured; no queue consumer started.',
      );
    },
  );
} else {
  const url = new URL(process.env.REDIS_URL);
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('Expected redis:// or rediss://');
  const worker = new Worker('yinghuo-demo', async (job) => processDemoJob(job.data), {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      db: Number(url.pathname.slice(1) || 0),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    },
    concurrency: 2,
  });
  worker.on('failed', (job, error) => console.error('Demo job failed', job?.id, error.message));
  worker.on('error', (error) => console.error('Queue connection error:', error.message));
  const stop = async () => {
    await worker.close();
    process.exitCode = 0;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  console.log('Local demo worker listening on yinghuo-demo');
}
