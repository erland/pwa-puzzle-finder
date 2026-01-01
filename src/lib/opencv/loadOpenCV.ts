/**
 * Stable OpenCV loader for Vite/PWA.
 *
 * Why:
 * - OpenCV's Emscripten bundle is sensitive to bundler transforms.
 * - Serving `opencv.js` from /public (static) avoids Vite rewriting the file.
 *
 * How it works:
 * - `npm install` (postinstall) copies opencv.js -> public/vendor/opencv/opencv.js
 * - This loader injects a *classic script* tag pointing at that file
 * - We ensure a global `var Module = ...` exists before loading
 * - We resolve once runtime is initialized and return the best "cv" handle available
 *
 * Notes:
 * - Many OpenCV.js builds expose `window.cv`.
 * - Some expose the API on `window.Module` instead. We alias it to `window.cv`.
 */
export type OpenCvModule = any;

const OPENCV_PUBLIC_REL_PATH = 'vendor/opencv/opencv.js';
const OPENCV_SCRIPT_ATTR = 'data-opencv-js';

let cachedPromise: Promise<OpenCvModule> | null = null;

function looksLikeOpenCv(obj: any): boolean {
  return !!obj && typeof obj.Mat === 'function' && typeof obj.cvtColor === 'function';
}

function getOpenCvCandidate(): any | undefined {
  const g = globalThis as any;
  if (looksLikeOpenCv(g.cv)) return g.cv;
  if (looksLikeOpenCv(g.Module)) return g.Module;
  if (g.Module && looksLikeOpenCv(g.Module.cv)) return g.Module.cv;
  return undefined;
}

function ensureGlobalModuleVar() {
  const g = globalThis as any;
  // Ensure the property exists.
  if (!g.Module) g.Module = {};

  // Ensure the *variable* Module exists in the global scope for classic scripts.
  // We do this by injecting a tiny classic script once.
  if (!document.querySelector('script[data-opencv-module-var="true"]')) {
    const s = document.createElement('script');
    s.setAttribute('data-opencv-module-var', 'true');
    s.text = 'window.Module = window.Module || {}; var Module = window.Module;';
    document.head.appendChild(s);
  }

  return g.Module;
}

function getBasePath(): string {
  // Tests can override this to simulate GitHub Pages base paths.
  const g = globalThis as any;
  const override = typeof g.__PUZZLE_FINDER_BASE_URL__ === 'string' ? g.__PUZZLE_FINDER_BASE_URL__ : undefined;
  const fromBaseTag =
    typeof document !== 'undefined'
      ? (document.querySelector('base')?.getAttribute('href') ?? undefined)
      : undefined;

  const raw = override ?? fromBaseTag;

  if (raw) {
    try {
      // Accept both absolute and relative values.
      const u = new URL(raw, document.baseURI);
      const p = u.pathname;
      return p.endsWith('/') ? p : p + '/';
    } catch {
      // Fall through
    }
  }

  // Derive base from the current document URL.
  // If index.html is served from /pwa-puzzle-finder/, this resolves to "/pwa-puzzle-finder/".
  try {
    const p = new URL('.', document.baseURI).pathname;
    return p.endsWith('/') ? p : p + '/';
  } catch {
    return '/';
  }
}

function getScriptSrc(): string {
  const base = getBasePath();
  return base + OPENCV_PUBLIC_REL_PATH;
}


function ensureScriptInjected(): HTMLScriptElement {
  const existing = document.querySelector(`script[${OPENCV_SCRIPT_ATTR}="true"]`) as HTMLScriptElement | null;
  if (existing) return existing;

  const script = document.createElement('script');
  script.setAttribute(OPENCV_SCRIPT_ATTR, 'true');
  script.src = getScriptSrc();
  script.async = true;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
  return script;
}

export async function loadOpenCV(): Promise<OpenCvModule> {
  if (cachedPromise) return cachedPromise;

  cachedPromise = new Promise<OpenCvModule>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('OpenCV can only be loaded in a browser environment.'));
      return;
    }

    const existing = getOpenCvCandidate();
    if (existing) {
      (globalThis as any).cv = existing;
      resolve(existing);
      return;
    }

    const Module = ensureGlobalModuleVar();

    // Chain any existing onRuntimeInitialized if present.
    const prevInit = (Module as any).onRuntimeInitialized;
    (Module as any).onRuntimeInitialized = () => {
      try {
        if (typeof prevInit === 'function') prevInit();
      } finally {
        const candidate = getOpenCvCandidate();
        if (!candidate) {
          reject(new Error('OpenCV runtime initialized, but no global `cv`/`Module` OpenCV API was found.'));
          return;
        }
        // Alias to window.cv to simplify downstream usage.
        (globalThis as any).cv = candidate;
        resolve(candidate);
      }
    };

    const script = ensureScriptInjected();

    script.addEventListener('error', () => {
      reject(new Error(`Failed to load opencv.js script at: ${script.src}`));
    });

    script.addEventListener('load', () => {
      // Some builds populate cv immediately after load (before runtime init callback).
      const candidate = getOpenCvCandidate();
      if (candidate) {
        (globalThis as any).cv = candidate;
        resolve(candidate);
      }
      // Otherwise wait for onRuntimeInitialized.
    });
  });

  return cachedPromise;
}

/**
 * Tests can call this to reset the cached loader.
 */
export function __resetOpenCVCachedPromiseForTests() {
  cachedPromise = null;
}
