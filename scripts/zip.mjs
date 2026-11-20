// Packages dist/waister/ into a zip ready for upload to the Chrome Web Store / Firefox Add-ons.
// The browser is read from the built manifest (`background.scripts` = Firefox build).
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const extensionDir = 'dist/waister';
const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync(`${extensionDir}/manifest.json`, 'utf8'));
const browser = manifest.background?.scripts ? 'firefox' : 'chrome';
const out = resolve(`dist/${name}-${version}-${browser}.zip`);
rmSync(out, { force: true });

if (process.platform === 'win32') {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${extensionDir.replaceAll('/', '\\')}\\*' -DestinationPath '${out}'`,
  ]);
} else {
  execFileSync('zip', ['-r', out, '.'], { cwd: extensionDir, stdio: 'inherit' });
}

console.log(`[zip] wrote ${out}`);
