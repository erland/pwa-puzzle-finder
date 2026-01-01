import type { OpenCvModule } from './loadOpenCV';

export type HelloOpenCvOptions = {
  /** Lower values = more edges. */
  cannyLowThreshold?: number;
  /** Higher values = fewer edges. */
  cannyHighThreshold?: number;
  /** Target width for processing (keeps processing cost predictable). */
  targetWidth?: number;
};

/**
 * A tiny "Hello OpenCV" frame processor.
 *
 * Pipeline:
 * 1) draw video frame -> input canvas
 * 2) RGBA -> GRAY
 * 3) Canny edges
 * 4) GRAY -> RGBA
 * 5) show -> output canvas
 */
export function processHelloOpenCvFrame(params: {
  cv: OpenCvModule;
  video: HTMLVideoElement;
  inputCanvas: HTMLCanvasElement;
  outputCanvas: HTMLCanvasElement;
  options?: HelloOpenCvOptions;
}): void {
  const { cv, video, inputCanvas, outputCanvas, options } = params;

  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (!vw || !vh) return;

  const targetWidth = Math.max(160, Math.min(options?.targetWidth ?? 640, vw));
  const targetHeight = Math.round((targetWidth * vh) / vw);

  if (inputCanvas.width !== targetWidth || inputCanvas.height !== targetHeight) {
    inputCanvas.width = targetWidth;
    inputCanvas.height = targetHeight;
  }
  if (outputCanvas.width !== targetWidth || outputCanvas.height !== targetHeight) {
    outputCanvas.width = targetWidth;
    outputCanvas.height = targetHeight;
  }

  const ctx = inputCanvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

  // OpenCV processing.
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const rgba = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Canny(gray, edges, options?.cannyLowThreshold ?? 60, options?.cannyHighThreshold ?? 120);
    cv.cvtColor(edges, rgba, cv.COLOR_GRAY2RGBA);
    cv.imshow(outputCanvas, rgba);
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    rgba.delete();
  }
}
