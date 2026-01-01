import type { OpenCvModule } from './loadOpenCV';

export type SegmentPiecesOptions = {
  /** Target width used for processing (downscales to keep CPU manageable). */
  targetWidth?: number;
  /** Minimum contour area ratio (relative to frame area) to keep as a "piece". */
  minAreaRatio?: number;
  /** Kernel size (odd number) for morphology; default 5. */
  morphKernelSize?: number;
  /** Blur kernel size (odd number); default 5. */
  blurKernelSize?: number;
};

export type PieceCandidate = {
  id: number;
  areaPx: number;
  bbox: { x: number; y: number; width: number; height: number };
  /** Polygon points in SOURCE frame coordinates. */
  contour: Array<{ x: number; y: number }>;
};

export type SegmentPiecesResult = {
  pieces: PieceCandidate[];
  debug: {
    sourceWidth: number;
    sourceHeight: number;
    processedWidth: number;
    processedHeight: number;
    scaleToSource: number;
    inverted: boolean;
    threshold: 'otsu';
    piecesKept: number;
    contoursFound: number;
  };
};

/**
 * Segment puzzle pieces from a mostly-uniform background.
 *
 * This is intentionally a conservative "v1" segmentation pipeline:
 * - Convert to grayscale
 * - Blur
 * - Otsu threshold (+ auto-invert so pieces become white)
 * - Morph close/open to clean up
 * - Find external contours and filter by area
 *
 * Returns piece contours and bounding boxes in SOURCE coordinates.
 *
 * It also renders a binary mask preview into `outputCanvas` (white = piece, black = background).
 */
export function segmentPiecesFromFrame(params: {
  cv: OpenCvModule;
  source: HTMLVideoElement | HTMLCanvasElement;
  inputCanvas: HTMLCanvasElement;
  outputCanvas: HTMLCanvasElement;
  options?: SegmentPiecesOptions;
}): SegmentPiecesResult {
  const { cv, source, inputCanvas, outputCanvas, options } = params;

  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

  if (!sourceWidth || !sourceHeight) {
    return {
      pieces: [],
      debug: {
        sourceWidth: sourceWidth || 0,
        sourceHeight: sourceHeight || 0,
        processedWidth: 0,
        processedHeight: 0,
        scaleToSource: 1,
        inverted: false,
        threshold: 'otsu',
        piecesKept: 0,
        contoursFound: 0
      }
    };
  }

  const targetWidth = options?.targetWidth ?? 640;
  const scale = sourceWidth > targetWidth ? targetWidth / sourceWidth : 1;
  const processedWidth = Math.max(1, Math.round(sourceWidth * scale));
  const processedHeight = Math.max(1, Math.round(sourceHeight * scale));

  inputCanvas.width = processedWidth;
  inputCanvas.height = processedHeight;

  const ctx = inputCanvas.getContext('2d');
  if (!ctx) {
    return {
      pieces: [],
      debug: {
        sourceWidth,
        sourceHeight,
        processedWidth,
        processedHeight,
        scaleToSource: 1 / scale,
        inverted: false,
        threshold: 'otsu',
        piecesKept: 0,
        contoursFound: 0
      }
    };
  }

  // Draw the current frame into the processing canvas.
  ctx.drawImage(source as any, 0, 0, processedWidth, processedHeight);

  // Prepare output preview canvas (binary mask in RGBA).
  outputCanvas.width = processedWidth;
  outputCanvas.height = processedHeight;

  const imageData = ctx.getImageData(0, 0, processedWidth, processedHeight);
  const src = cv.matFromImageData(imageData); // RGBA
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const kernel = new cv.Mat();
  const tmp = new cv.Mat();
  const maskRgba = new cv.Mat();

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let inverted = false;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const blurK = Math.max(1, options?.blurKernelSize ?? 5);
    const blurKOdd = blurK % 2 === 0 ? blurK + 1 : blurK;
    cv.GaussianBlur(gray, blurred, new cv.Size(blurKOdd, blurKOdd), 0, 0, cv.BORDER_DEFAULT);

    // Otsu threshold (we'll auto-invert after we inspect foreground ratio).
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    // Decide inversion so that "pieces" become white (foreground).
    const nonZero = cv.countNonZero(binary);
    const total = binary.rows * binary.cols;
    // If foreground occupies most of the frame, we likely thresholded background as white -> invert.
    if (nonZero > total * 0.5) {
      cv.bitwise_not(binary, binary);
      inverted = true;
    }

    const morphK = Math.max(1, options?.morphKernelSize ?? 5);
    const morphKOdd = morphK % 2 === 0 ? morphK + 1 : morphK;
    kernel.create(morphKOdd, morphKOdd, cv.CV_8U);
    kernel.setTo(new cv.Scalar(1));

    // Clean mask: close gaps + remove small specks
    cv.morphologyEx(binary, tmp, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(tmp, binary, cv.MORPH_OPEN, kernel);

    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minAreaRatio = options?.minAreaRatio ?? 0.0015;
    const minAreaPx = minAreaRatio * (binary.rows * binary.cols);

    const pieces: PieceCandidate[] = [];

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt, false);
      if (area < minAreaPx) continue;

      const rect = cv.boundingRect(cnt);

      // Approximate contour to reduce point count.
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      try {
        cv.approxPolyDP(cnt, approx, 0.01 * peri, true);

        const pts: Array<{ x: number; y: number }> = [];
        for (let j = 0; j < approx.rows; j++) {
          const x = approx.intPtr(j, 0)[0];
          const y = approx.intPtr(j, 0)[1];
          // Map back to SOURCE coordinates.
          pts.push({ x: x / scale, y: y / scale });
        }

        pieces.push({
          id: pieces.length + 1,
          areaPx: Math.round(area / (scale * scale)),
          bbox: {
            x: rect.x / scale,
            y: rect.y / scale,
            width: rect.width / scale,
            height: rect.height / scale
          },
          contour: pts
        });
      } finally {
        approx.delete();
      }
    }

    // Render binary mask preview.
    cv.cvtColor(binary, maskRgba, cv.COLOR_GRAY2RGBA);
    cv.imshow(outputCanvas, maskRgba);

    return {
      pieces,
      debug: {
        sourceWidth,
        sourceHeight,
        processedWidth,
        processedHeight,
        scaleToSource: 1 / scale,
        inverted,
        threshold: 'otsu',
        piecesKept: pieces.length,
        contoursFound: contours.size()
      }
    };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    binary.delete();
    kernel.delete();
    tmp.delete();
    maskRgba.delete();
    contours.delete();
    hierarchy.delete();
  }
}
