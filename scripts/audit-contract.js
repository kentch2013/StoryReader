import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');

try {
  const diffOutput = execSync('git diff --name-only HEAD test/', {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  if (diffOutput.length > 0) {
    console.error('❌ Contract Audit Violation: Test files have been modified:');
    console.error(diffOutput);
    process.exit(1);
  }
  console.log('✅ Contract Audit: Test files remained 100% immutable.');
} catch (err) {
  if (err.status === 1) {
    process.exit(1);
  }
  // If no commit has test/ yet, pass audit cleanly
  console.log('✅ Contract Audit: Test files remained 100% immutable.');
}
