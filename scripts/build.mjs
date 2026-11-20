import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
/** The unpacked extension. Load this folder in the browser. */
const outdir = 'dist/waister';

/** Files copied as-is into the extension folder ([source, destination]). */
const staticFiles = [
  ['src/manifest.json', 'manifest.json'],
  ['src/ui/popup/popup.html', 'popup/index.html'],
  ['src/ui/popup/popup.css', 'popup/index.css'],
  ['public', '.'],
];

function copyStatic() {
  for (const [from, to] of staticFiles) {
    if (existsSync(from)) cpSync(from, `${outdir}/${to}`, { recursive: true });
  }
}

/** @type {esbuild.Plugin} */
const copyStaticPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        copyStatic();
        console.log(`[build] ${new Date().toLocaleTimeString()} done`);
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
    // ES module (the manifest declares the background as "type": "module").
    entryPoints: { background: 'src/entries/background.entry.ts' },
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
