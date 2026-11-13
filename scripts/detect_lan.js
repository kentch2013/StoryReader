import os from 'node:os';

const port = process.env.PORT || 3000;
const ifaces = os.networkInterfaces();
let found = false;

console.log('  Local Wi-Fi / LAN Endpoints (Direct LAN testing):');
for (const name of Object.keys(ifaces)) {
  for (const net of ifaces[name] || []) {
    if (net.family === 'IPv4' && !net.internal) {
      console.log(`    - App:         http://${net.address}:${port}/`);
      console.log(`    - Camera Tray: http://${net.address}:${port}/test_camera.html`);
      console.log(`    - Health:      http://${net.address}:${port}/api/health`);
      found = true;
    }
  }
}

if (!found) {
  console.log('    (No active LAN IPv4 found)');
} else {
  console.log('  ℹ️  Note: iOS Safari restricts camera/mic access to secure origins.');
  console.log('     Use the Cloudflare HTTPS Tunnel below for iPhone 14 Plus testing.');
}
