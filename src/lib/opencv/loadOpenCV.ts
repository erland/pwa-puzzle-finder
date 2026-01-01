/**
 * Lazy OpenCV loader.
 *
 * We intentionally load OpenCV only on user action:
 * - Keeps initial bundle smaller.
 * - Keeps Jest/jsdom tests stable (no WASM).
 */
export type OpenCvModule = any;

let cachedPromise: Promise<OpenCvModule> | null = null;

export async function loadOpenCV(): Promise<OpenCvModule> {
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async () => {
    if (typeof window === 'undefined') {
      throw new Error('OpenCV can only be loaded in a browser environment.');
    }

    // opencv-js-wasm exports a default async loader function that resolves to the cv module.
    const mod: any = await import('opencv-js-wasm');
    const loader: any = mod?.default ?? mod;
    if (typeof loader !== 'function') {
      throw new Error('OpenCV loader is not a function (unexpected module shape).');
    }

    const cv: any = await loader();
    return cv;
  })();

  return cachedPromise;
}

/**
 * Tests can call this to reset the cached loader.
 */
export function __resetOpenCVCachedPromiseForTests() {
  cachedPromise = null;
}
