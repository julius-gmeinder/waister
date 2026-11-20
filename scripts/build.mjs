import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

/** Files copied as-is into dist/ ([source, destination]). */
const staticFiles = [
  ['src/manifest.json', 'manifest.json'],
  ['src/popup/popup.html', 'popup/popup.html'],
  ['src/popup/popup.css', 'popup/popup.css'],
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
const options = {
  entryPoints: {
    background: 'src/background.ts',
    content: 'src/content.ts',
    'popup/popup': 'src/popup/popup.ts',
  },
  outdir,
  bundle: true,
  // IIFE keeps every entry self-contained: content scripts can't use ES module imports.
  format: 'iife',
  target: 'es2022',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
  plugins: [copyStaticPlugin],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[build] watching for changes…');
} else {
  await esbuild.build(options);
}
