// Packages dist/ into a zip ready for upload to the Chrome Web Store / Firefox Add-ons.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
const out = resolve(`${name}-${version}.zip`);
rmSync(out, { force: true });

if (process.platform === 'win32') {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path 'dist\\*' -DestinationPath '${out}'`,
  ]);
} else {
  execFileSync('zip', ['-r', out, '.'], { cwd: 'dist', stdio: 'inherit' });
}

console.log(`[zip] wrote ${out}`);
