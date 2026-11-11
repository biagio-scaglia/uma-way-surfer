import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Everything the game can need: code, styles, every 3D model and the Latin font files. */
const PRECACHE = /\.(js|css|glb)$|-latin(-ext)?-\d+-normal-[\w-]+\.woff2$/;

// Writes the list of built files into sw.js, so the first visit downloads the whole game.
function precacheList(): Plugin {
  let outDir = 'dist';
  return {
    name: 'precache-list',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const files = readdirSync(join(outDir, 'assets')).filter(f => PRECACHE.test(f)).map(f => `./assets/${f}`);
      const sw = join(outDir, 'sw.js');
      const source = readFileSync(sw, 'utf8');
      if (!source.includes('self.__PRECACHE__')) throw new Error('sw.js: precache placeholder missing');
      writeFileSync(sw, source.replace('self.__PRECACHE__', JSON.stringify(['./', ...files])));
    },
  };
}

// Relative paths, so the build works from the /uma-way-surfer/ folder on GitHub Pages.
export default defineConfig({ base: './', plugins: [precacheList()] });
