import { spawn, execSync } from 'node:child_process';

const port = process.env.PORT || 3000;
const target = `http://localhost:${port}`;

console.log('⏳ Initializing Cloudflare Quick Tunnel for Mobile Devices...');

const isWindows = process.platform === 'win32';
const cloudflared = spawn(
  isWindows ? 'cmd.exe' : 'npx',
  isWindows
    ? ['/c', 'npx', '--yes', 'cloudflared', 'tunnel', '--url', target]
    : ['--yes', 'cloudflared', 'tunnel', '--url', target],
  { stdio: ['inherit', 'pipe', 'pipe'] }
);

let urlFound = false;

function handleOutput(data) {
  const text = data.toString();
  process.stderr.write(text);

  if (!urlFound) {
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      urlFound = true;
      const tunnelUrl = match[0];
      const connectUrl = `http://localhost:${port}/connect.html?url=${encodeURIComponent(tunnelUrl)}`;

      console.log('\n================================================================');
      console.log('🎉 MOBILE HTTPS TUNNEL READY!');
      console.log(`🔗 Public URL: ${tunnelUrl}`);
      console.log('📋 Automatically copied to Windows Clipboard!');
      console.log('📱 Opening QR Code on your monitor — point your iPhone camera to connect.');
      console.log('================================================================\n');

      if (isWindows) {
        try {
          execSync(`powershell -NoProfile -Command "Set-Clipboard -Value '${tunnelUrl}'"`, {
            stdio: 'ignore',
          });
        } catch {
          // Ignore clipboard failures
        }

        try {
          execSync(`start "" "${connectUrl}"`, { stdio: 'ignore' });
        } catch {
          // Ignore browser launch failures
        }
      }
    }
  }
}

cloudflared.stdout.on('data', handleOutput);
cloudflared.stderr.on('data', handleOutput);

cloudflared.on('exit', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  cloudflared.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  cloudflared.kill('SIGTERM');
  process.exit(0);
});
