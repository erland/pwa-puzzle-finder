import type { OpenCvModule } from './loadOpenCV';
import type { ExtractedPiece } from './extractPieces';

export type PieceClassification = 'corner' | 'edge' | 'interior';

export type ClassifyPiecesOptions = {
  borderTolerancePx?: number;
  angleToleranceDeg?: number;
  minLineLengthRatio?: number;
  houghThreshold?: number;
};

function deg(vRad: number) {
  return (vRad * 180) / Math.PI;
}

function normalizeAngle0to180(angleDeg: number) {
  let a = angleDeg % 180;
  if (a < 0) a += 180;
  return a;
}

function isNear(val: number, target: number, tol: number) {
  return Math.abs(val - target) <= tol;
}

/**
 * MVP rule-based classification:
 * - Detect long, near-horizontal/near-vertical line segments on the OUTER BOUNDARY of the piece.
 * - 2 adjacent "straight" sides => corner.
 * - 1 straight side => edge.
 * - 0 straight sides => interior.
 *
 * Notes:
 * - This is a heuristic that works best when pieces are separated and on a contrasting background.
 * - The result is intended to be "good enough" for MVP; later steps can improve robustness.
 */
export function classifyEdgeCornerMvp(params: {
  cv: OpenCvModule;
  processedFrameCanvas: HTMLCanvasElement;
  pieces: ExtractedPiece[];
  options?: ClassifyPiecesOptions;
}): { pieces: ExtractedPiece[]; debug: string } {
  const { cv, processedFrameCanvas, pieces, options } = params;

  const borderTol = options?.borderTolerancePx ?? 6;
  const angleTol = options?.angleToleranceDeg ?? 20;
  const minLenRatio = options?.minLineLengthRatio ?? 0.35;
  const houghThreshold = options?.houghThreshold ?? 30;

  const ctx2d = processedFrameCanvas.getContext('2d');
  if (!ctx2d) {
    return {
      pieces: pieces.map((p) => ({ ...p, classification: 'interior', classificationDebug: 'No 2D context.' })),
      debug: 'No 2D context.'
    };
  }

  let corners = 0;
  let edges = 0;
  let interiors = 0;

  const updated: ExtractedPiece[] = [];

  for (const p of pieces) {
    const roi = p.bboxProcessed;
    const x = Math.max(0, Math.floor(roi.x));
    const y = Math.max(0, Math.floor(roi.y));
    const w = Math.max(1, Math.floor(roi.width));
    const h = Math.max(1, Math.floor(roi.height));

    const contour = p.contourProcessed ?? [];
    if (contour.length < 3) {
      updated.push({ ...p, classification: 'interior', classificationDebug: 'Missing contour.' });
      interiors++;
      continue;
    }

    const imageData = ctx2d.getImageData(x, y, w, h);
    const rgba = cv.matFromImageData(imageData);

    const mask = new cv.Mat(h, w, cv.CV_8UC1, new cv.Scalar(0));
    const cnt = new cv.Mat(contour.length, 1, cv.CV_32SC2);
    for (let i = 0; i < contour.length; i++) {
      cnt.intPtr(i, 0)[0] = Math.round(contour[i].x - x);
      cnt.intPtr(i, 0)[1] = Math.round(contour[i].y - y);
    }
    const contoursVec = new cv.MatVector();
    contoursVec.push_back(cnt);
    cv.fillPoly(mask, contoursVec, new cv.Scalar(255));

    const gray = new cv.Mat();
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);

    const masked = new cv.Mat();
    cv.bitwise_and(gray, gray, masked, mask);

    const boundary = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(mask, boundary, cv.MORPH_GRADIENT, kernel);

    const edgesMat = new cv.Mat();
    cv.Canny(masked, edgesMat, 50, 100);

    const boundaryEdges = new cv.Mat();
    cv.bitwise_and(edgesMat, edgesMat, boundaryEdges, boundary);

    const lines = new cv.Mat();
    const minLineLength = Math.max(10, Math.floor(Math.max(w, h) * minLenRatio));
    cv.HoughLinesP(boundaryEdges, lines, 1, Math.PI / 180, houghThreshold, minLineLength, 10);

    let hasHorizontal = false;
    let hasVertical = false;
    let bestHLen = 0;
    let bestVLen = 0;

    for (let i = 0; i < lines.rows; i++) {
      const x1 = lines.intPtr(i, 0)[0];
      const y1 = lines.intPtr(i, 0)[1];
      const x2 = lines.intPtr(i, 0)[2];
      const y2 = lines.intPtr(i, 0)[3];

      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < minLineLength) continue;

      const a = normalizeAngle0to180(deg(Math.atan2(dy, dx)));

      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      // Horizontal-ish near top/bottom border
      if (isNear(a, 0, angleTol) || isNear(a, 180, angleTol)) {
        if (minY <= borderTol || maxY >= h - 1 - borderTol) {
          hasHorizontal = true;
          bestHLen = Math.max(bestHLen, len);
        }
        continue;
      }

      // Vertical-ish near left/right border
      if (isNear(a, 90, angleTol)) {
        if (minX <= borderTol || maxX >= w - 1 - borderTol) {
          hasVertical = true;
          bestVLen = Math.max(bestVLen, len);
        }
        continue;
      }
    }

    let classification: PieceClassification = 'interior';
    if (hasHorizontal && hasVertical) classification = 'corner';
    else if (hasHorizontal || hasVertical) classification = 'edge';

    if (classification === 'corner') corners++;
    else if (classification === 'edge') edges++;
    else interiors++;

    const debug = [
      `roi=${w}x${h}`,
      `minLine=${minLineLength}px`,
      `H=${hasHorizontal ? 'yes' : 'no'}(${Math.round(bestHLen)}px)`,
      `V=${hasVertical ? 'yes' : 'no'}(${Math.round(bestVLen)}px)`
    ].join(' · ');

    updated.push({ ...p, classification, classificationDebug: debug });

    // cleanup
    rgba.delete();
    mask.delete();
    cnt.delete();
    contoursVec.delete();
    gray.delete();
    masked.delete();
    boundary.delete();
    kernel.delete();
    edgesMat.delete();
    boundaryEdges.delete();
    lines.delete();
  }

  return { pieces: updated, debug: `Classified: ${updated.length} (corner ${corners}, edge ${edges}, interior ${interiors})` };
}
