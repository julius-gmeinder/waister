import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');
/** Target browser. src/manifest.json is the Chrome manifest, `--firefox` patches it. */
const firefox = process.argv.includes('--firefox');
/** The unpacked extension. Load this folder in the browser. */
const outdir = 'dist/waister';

/** Files copied as-is into the extension folder ([source, destination]). */
const staticFiles = [
  ['src/ui/popup/popup.html', 'popup/index.html'],
  ['src/ui/popup/popup.css', 'popup/index.css'],
  ['public', '.'],
  // sqlite-wasm resolves this relative to background.js (via import.meta.url).
  ['node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm', 'sqlite3.wasm'],
];

/**
 * Writes manifest.json for the target browser. Chrome MV3 only accepts
 * `background.service_worker` (it warns about `scripts`). Firefox doesn't support service
 * workers and needs `background.scripts` instead.
 */
function writeManifest() {
  const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
  if (firefox) {
    const { service_worker: worker, ...background } = manifest.background;
    manifest.background = { ...background, scripts: [worker] };
  }
  writeFileSync(
    `${outdir}/manifest.json`,
    `${JSON.stringify(manifest, null, 2)}
`,
  );
}

function copyStatic() {
  for (const [from, to] of staticFiles) {
    if (existsSync(from)) cpSync(from, `${outdir}/${to}`, { recursive: true });
  }
  writeManifest();
}

/** @type {esbuild.Plugin} */
const copyStaticPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        copyStatic();
        console.log(
          `[build] ${new Date().toLocaleTimeString()} done (${firefox ? 'firefox' : 'chrome'})`,
        );
      }
    });
  },
};

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

/** @type {esbuild.BuildOptions} */
const shared = {
  outdir,
  bundle: true,
  target: 'es2022',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions[]} */
const builds = [
  {
    ...shared,
    entryPoints: { background: 'src/entries/background.entry.ts' },
    // ESM so sqlite-wasm can find sqlite3.wasm through import.meta.url.
    format: 'esm',
  },
  {
    ...shared,
    entryPoints: {
      content: 'src/entries/content.entry.ts',
      'popup/index': 'src/entries/popup.entry.ts',
    },
    // IIFE keeps every entry self-contained: content scripts can't use ES module imports.
    format: 'iife',
    plugins: [copyStaticPlugin],
  },
];

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
  console.log('[build] watching for changes…');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
