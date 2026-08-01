// Cross-platform build runner for `npm run build`.
// Delegates to build.ps1 on Windows and build.sh on macOS/Linux,
// so `npm run build` works on any developer machine or CI runner.
// Accepts the same optional target flags as the scripts (e.g. -Chrome, -Firefox).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, '..');
const args = process.argv.slice(2);

let command;
if (process.platform === 'win32') {
  command = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'build.ps1'), ...args];
} else {
  command = ['bash', join(root, 'build.sh'), ...args];
}

const child = spawn(command[0], command.slice(1), { stdio: 'inherit', cwd: root });
child.on('error', (err) => {
  console.error('Failed to start build:', err.message);
  process.exit(1);
});
child.on('exit', (code) => {
  process.exit(code ?? 1);
});
