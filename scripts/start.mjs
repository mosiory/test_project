import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('[start] dist/index.html یافت نشد. ابتدا «npm run build» را اجرا کنید.');
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[start] SESSION_SECRET تنظیم نشده است؛ کلید امضای نشست از فایل data/.session-secret خوانده می‌شود.'
  );
}

const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
