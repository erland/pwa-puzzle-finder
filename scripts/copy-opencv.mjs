/**
 * Copies opencv.js from node_modules into public/vendor so Vite serves it as a plain static asset
 * (no bundler transforms), which is the most reliable way to load Emscripten OpenCV builds.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const src = path.join(projectRoot, 'node_modules', 'opencv-js-wasm', 'opencv.js');
const destDir = path.join(projectRoot, 'public', 'vendor', 'opencv');
const dest = path.join(destDir, 'opencv.js');

if (!fs.existsSync(src)) {
  console.error('[copy-opencv] Source not found:', src);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[copy-opencv] Copied to', dest);
