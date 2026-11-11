import os from 'node:os';

const port = process.env.PORT || 3000;
const ifaces = os.networkInterfaces();
let found = false;

console.log('  Local Wi-Fi / LAN Addresses (Same Wi-Fi network):');
for (const name of Object.keys(ifaces)) {
  for (const net of ifaces[name] || []) {
    if (net.family === 'IPv4' && !net.internal) {
      console.log(`    - http://${net.address}:${port}`);
      console.log(`      (Health check: http://${net.address}:${port}/api/health)`);
      found = true;
    }
  }
}

if (!found) {
  console.log('    (No active LAN IPv4 found)');
}
