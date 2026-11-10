import { execSync } from 'node:child_process';

const port = process.env.PORT || 3000;

console.log('============================================================');
console.log(` StoryReader Launcher (Port ${port})`);
console.log('============================================================');

try {
  const output = execSync(`netstat -ano`, { encoding: 'utf8' });
  const lines = output.split('\n');
  const pids = new Set();

  for (const line of lines) {
    if (line.includes(`:${port}`) && line.includes('LISTENING')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid) && Number(pid) !== process.pid) {
        pids.add(pid);
      }
    }
  }

  if (pids.size > 0) {
    for (const pid of pids) {
      console.log(`[INFO] Terminating previous process on port ${port} (PID: ${pid})...`);
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } catch {
        // ignore if already exited
      }
    }
    console.log('[INFO] Port cleared.');
  } else {
    console.log(`[INFO] Port ${port} is free.`);
  }
} catch (err) {
  console.warn('[WARN] Could not check listening ports:', err.message);
}

console.log(`[INFO] Starting StoryReader server...`);
console.log(`[INFO] Server:       http://localhost:${port}`);
console.log(`[INFO] Health check: http://localhost:${port}/api/health`);
console.log('============================================================');
