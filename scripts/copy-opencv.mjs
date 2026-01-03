/**
 * Copies OpenCV artifacts from node_modules into public/vendor so Vite serves them as plain static assets
 * (no bundler transforms), which is the most reliable way to load Emscripten OpenCV builds in the main
 * thread and in Web Workers.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const pkgDir = path.join(projectRoot, 'node_modules', 'opencv-js-wasm');
const srcJs = path.join(pkgDir, 'opencv.js');

const destDir = path.join(projectRoot, 'public', 'vendor', 'opencv');
const destJs = path.join(destDir, 'opencv.js');

if (!fs.existsSync(srcJs)) {
  console.error('[copy-opencv] Source not found:', srcJs);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(srcJs, destJs);
console.log('[copy-opencv] Copied to', destJs);

// Also copy any wasm/data sidecar files if present. Some OpenCV builds load these at runtime.
try {
  const entries = fs.readdirSync(pkgDir);
  const sidecars = entries.filter((f) => /\.(wasm|data)$/.test(f));
  for (const f of sidecars) {
    const from = path.join(pkgDir, f);
    const to = path.join(destDir, f);
    fs.copyFileSync(from, to);
    console.log('[copy-opencv] Copied to', to);
  }
} catch (e) {
  console.warn('[copy-opencv] Could not scan for sidecar files:', e && e.message ? e.message : String(e));
}
