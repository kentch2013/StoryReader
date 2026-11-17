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
      const cameraUrl = `${tunnelUrl}/test_camera.html`;
      const audioUrl = `${tunnelUrl}/test_audio.html`;
      const healthUrl = `${tunnelUrl}/api/health`;
      const connectUrl = `http://localhost:${port}/connect.html?url=${encodeURIComponent(tunnelUrl)}`;

      console.log('\n===============================================================================');
      console.log('  🎉 CLOUDFLARE HTTPS TUNNEL ACTIVE & READY FOR MOBILE TESTING!');
      console.log('===============================================================================');
      console.log(`  🔗 Root Webapp URL:        ${tunnelUrl}`);
      console.log(`  📸 Module 4 Camera Tray:   ${cameraUrl}`);
      console.log(`  🎙️ Module 5 Audio Coord:   ${audioUrl}`);
      console.log(`  🩺 API Health Check:       ${healthUrl}`);
      console.log('-------------------------------------------------------------------------------');
      console.log('  📋 Tunnel URL automatically copied to Windows Clipboard!');
      console.log(`  🖥️ Scannable QR Portal:    ${connectUrl}`);
      console.log('-------------------------------------------------------------------------------');
      console.log('  📱 ZERO-TYPING IPHONE 14 PLUS INSTRUCTIONS:');
      console.log('     1. Look at the browser tab that just opened on your monitor.');
      console.log('     2. Aim your iPhone Camera at the high-res QR code.');
      console.log('     3. Tap the yellow "trycloudflare.com" banner to open Safari.');
      console.log('     4. Allow Camera permissions and snap 3 book pages.');
      console.log('     5. Confirm filmstrip ordering and canvas compression (<= 300KB/page).');
      console.log('===============================================================================\n');

      if (isWindows) {
        try {
          execSync(`powershell -NoProfile -Command "Set-Clipboard -Value '${cameraUrl}'"`, {
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
