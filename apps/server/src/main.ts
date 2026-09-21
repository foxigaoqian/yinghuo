import { loadEnvironment } from './config';
import { createApp } from './bootstrap';
loadEnvironment();
void createApp()
  .then((app) =>
    app.listen(Number(process.env.API_PORT || 3001), process.env.API_HOST || '127.0.0.1'),
  )
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Startup failed');
    process.exitCode = 1;
  });
