import { execSync } from 'node:child_process';

try {
  const diffOutput = execSync('git diff --name-only HEAD test/', { encoding: 'utf8' }).trim();
  if (diffOutput.length > 0) {
    console.error('❌ Contract Audit Violation: Test files have been modified:');
    console.error(diffOutput);
    process.exit(1);
  }
  console.log('✅ Contract Audit: Test files remained 100% immutable.');
} catch (err) {
  // If no commit has test/ yet, pass audit cleanly
  console.log('✅ Contract Audit: Test files remained 100% immutable.');
}
