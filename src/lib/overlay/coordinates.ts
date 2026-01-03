export type Size = { w: number; h: number };

export type FitTransform = {
  /** Scale factor applied to source coordinates to map into viewport coordinates */
  scale: number;
  /** X offset in viewport coordinates (same units as viewport width/height; typically CSS pixels) */
  offX: number;
  /** Y offset in viewport coordinates */
  offY: number;
};

/**
 * Computes a uniform scale + center offset so that a source rectangle (srcW x srcH)
 * fits inside a viewport (viewW x viewH) with preserved aspect ratio (letterboxing).
 */
export function computeFitTransform(
  viewW: number,
  viewH: number,
  srcW: number,
  srcH: number
): FitTransform {
  const vw = Math.max(1, viewW);
  const vh = Math.max(1, viewH);
  const sw = Math.max(1, srcW);
  const sh = Math.max(1, srcH);

  const scale = Math.min(vw / sw, vh / sh);
  const offX = (vw - sw * scale) / 2;
  const offY = (vh - sh * scale) / 2;
  return { scale, offX, offY };
}

/** Maps a point in source coordinates -> viewport coordinates. */
export function mapSourceToViewportPoint(
  x: number,
  y: number,
  t: FitTransform
): { x: number; y: number } {
  return {
    x: x * t.scale + t.offX,
    y: y * t.scale + t.offY
  };
}

/** Maps a point in viewport coordinates -> source coordinates. */
export function mapViewportToSourcePoint(
  x: number,
  y: number,
  t: FitTransform
): { x: number; y: number } {
  return {
    x: (x - t.offX) / t.scale,
    y: (y - t.offY) / t.scale
  };
}
