import type { OpenCvModule } from './loadOpenCV';
import type { SegmentPiecesResult } from './segmentPieces';

export type ExtractPiecesOptions = {
  /** Exclude candidates whose bounding box touches the processed frame border within this margin (px). */
  borderMarginPx?: number;
  /** Padding added around the piece ROI when extracting (px, in processed coordinates). */
  paddingPx?: number;
  /** Minimum solidity (area / convexHullArea) to keep. */
  minSolidity?: number;
  /** Maximum aspect ratio (max(w/h, h/w)) to keep. */
  maxAspectRatio?: number;
  /** Optional cap to avoid extracting too many pieces. */
  maxPieces?: number;
};

export type ExtractedPiece = {
  id: number;
  bboxSource: { x: number; y: number; width: number; height: number };
  bboxProcessed: { x: number; y: number; width: number; height: number };
  areaPxProcessed: number;
  solidity: number;
  aspectRatio: number;
  /** PNG data URL for quick UI preview (transparent background). */
  previewUrl: string;
  /** Contour points in SOURCE coordinates (same as segmentation). */
  contourSource: Array<{ x: number; y: number }>;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function toMatOfPoint(cv: OpenCvModule, pts: Array<{ x: number; y: number }>) {
  const cnt = new cv.Mat(pts.length, 1, cv.CV_32SC2);
  for (let i = 0; i < pts.length; i++) {
    cnt.intPtr(i, 0)[0] = Math.round(pts[i].x);
    cnt.intPtr(i, 0)[1] = Math.round(pts[i].y);
  }
  return cnt;
}

function matToPngDataUrl(matRgba: any): string {
  const w = matRgba.cols;
  const h = matRgba.rows;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available.');
  // Copy mat data -> ImageData (ensure we don't keep a view into WASM memory)
  const copy = new Uint8ClampedArray(matRgba.data.slice(0));
  const img = new ImageData(copy, w, h);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Filter segmentation candidates using simple geometric heuristics and extract per-piece RGBA crops
 * (transparent background) suitable for thumbnails and later analysis.
 *
 * Important:
 * - Extraction uses the *processed* (downscaled) frame for performance.
 * - Returned bounding boxes include both SOURCE and PROCESSED coordinates for mapping/overlay.
 */
export function filterAndExtractPieces(params: {
  cv: OpenCvModule;
  segmentation: SegmentPiecesResult;
  /** The same canvas used as `inputCanvas` in segmentation (contains the processed RGBA frame). */
  processedFrameCanvas: HTMLCanvasElement;
  options?: ExtractPiecesOptions;
}): { pieces: ExtractedPiece[]; debug: string } {
  const { cv, segmentation, processedFrameCanvas, options } = params;

  const borderMarginPx = options?.borderMarginPx ?? 6;
  const paddingPx = options?.paddingPx ?? 6;
  const minSolidity = options?.minSolidity ?? 0.80;
  const maxAspectRatio = options?.maxAspectRatio ?? 4.0;
  const maxPieces = options?.maxPieces ?? 200;

  const procW = segmentation.debug.processedWidth;
  const procH = segmentation.debug.processedHeight;
  const scaleToSource = segmentation.debug.scaleToSource;

  const ctx = processedFrameCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Processed frame canvas has no 2D context.');
  }

  // Ensure we read the actual processed region (some canvases may be larger).
  const imageData = ctx.getImageData(0, 0, procW, procH);
  const src = cv.matFromImageData(imageData); // RGBA
  const mask = new cv.Mat.zeros(procH, procW, cv.CV_8UC1);

  const extracted: ExtractedPiece[] = [];

  let candidates = 0;
  let filteredBorder = 0;
  let filteredAspect = 0;
  let filteredSolidity = 0;

  try {
    for (const cand of segmentation.pieces) {
      if (extracted.length >= maxPieces) break;
      candidates++;

      // Convert SOURCE contour -> PROCESSED contour.
      const ptsProc = cand.contour.map((p) => ({ x: p.x / scaleToSource, y: p.y / scaleToSource }));
      if (ptsProc.length < 3) continue;

      const cnt = toMatOfPoint(cv, ptsProc);
      const hull = new cv.Mat();
      const contoursVec = new cv.MatVector();
      const approx = new cv.Mat();

      try {
        // (Optional) simplify contour to reduce noise
        const peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, 0.005 * peri, true);

        const useCnt = approx.total && approx.total() >= 3 ? approx : cnt;

        const rect = cv.boundingRect(useCnt);
        const aspect = rect.width > 0 && rect.height > 0 ? Math.max(rect.width / rect.height, rect.height / rect.width) : 999;

        // Filter: border proximity (likely partial piece or table edge)
        if (
          rect.x < borderMarginPx ||
          rect.y < borderMarginPx ||
          rect.x + rect.width > procW - borderMarginPx ||
          rect.y + rect.height > procH - borderMarginPx
        ) {
          filteredBorder++;
          continue;
        }

        // Filter: extreme aspect ratios (usually shadows/merged blobs)
        if (aspect > maxAspectRatio) {
          filteredAspect++;
          continue;
        }

        // Solidity filter (area / hullArea)
        cv.convexHull(useCnt, hull, true, true);
        const area = cv.contourArea(useCnt, false);
        const hullArea = cv.contourArea(hull, false);
        const solidity = hullArea > 0 ? area / hullArea : 0;

        if (solidity < minSolidity) {
          filteredSolidity++;
          continue;
        }

        // Draw filled contour into mask (reset region first for safety)
        // We draw per-piece into a clean mask ROI to keep things fast.
        mask.setTo(new cv.Scalar(0));
        contoursVec.push_back(useCnt);
        cv.drawContours(mask, contoursVec, -1, new cv.Scalar(255), cv.FILLED);

        // ROI with padding
        const rx = clamp(rect.x - paddingPx, 0, procW - 1);
        const ry = clamp(rect.y - paddingPx, 0, procH - 1);
        const r2x = clamp(rect.x + rect.width + paddingPx, 0, procW);
        const r2y = clamp(rect.y + rect.height + paddingPx, 0, procH);
        const rw = Math.max(1, r2x - rx);
        const rh = Math.max(1, r2y - ry);
        const roi = new cv.Rect(rx, ry, rw, rh);

        const srcRoi = src.roi(roi);
        const maskRoi = mask.roi(roi);

        // Create RGBA output with alpha = mask
        const out = new cv.Mat();
        srcRoi.copyTo(out);

        const alpha = new cv.Mat();
        cv.threshold(maskRoi, alpha, 0, 255, cv.THRESH_BINARY);

        const mv = new cv.MatVector();
cv.split(out, mv);

const ch0 = mv.get(0);
const ch1 = mv.get(1);
const ch2 = mv.get(2);
const ch3 = mv.get(3);

// Replace alpha channel (ensure we own the mats we keep)
const outVec = new cv.MatVector();
outVec.push_back(ch0);
outVec.push_back(ch1);
outVec.push_back(ch2);
outVec.push_back(alpha);

// ch3 is replaced; safe to delete
ch3.delete();
mv.delete();

cv.merge(outVec, out);

// Cleanup mats we created/owned
ch0.delete();
ch1.delete();
ch2.delete();
alpha.delete();
outVec.delete();


        const previewUrl = matToPngDataUrl(out);

        extracted.push({
          id: cand.id,
          bboxSource: cand.bbox,
          bboxProcessed: { x: roi.x, y: roi.y, width: roi.width, height: roi.height },
          areaPxProcessed: Math.round(area),
          solidity,
          aspectRatio: aspect,
          previewUrl,
          contourSource: cand.contour
        });

        // Cleanup ROI mats
        srcRoi.delete();
        maskRoi.delete();
        out.delete();
        // alpha deleted via mv cleanup
      } finally {
        cnt.delete();
        hull.delete();
        contoursVec.delete();
        approx.delete();
      }
    }

    const debug = [
      `Candidates: ${candidates}`,
      `Extracted: ${extracted.length}`,
      `Filtered (border): ${filteredBorder}`,
      `Filtered (aspect): ${filteredAspect}`,
      `Filtered (solidity): ${filteredSolidity}`
    ].join('\n');

    return { pieces: extracted, debug };
  } finally {
    src.delete();
    mask.delete();
  }
}
