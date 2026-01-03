export type FrameQuality = {
  /** Frame size used for the quality estimate (after any downscaling). */
  width: number;
  height: number;

  /** Luma mean (0..255). */
  mean: number;
  /** Luma standard deviation. */
  std: number;

  /** Variance of Laplacian (higher = sharper). */
  lapVar?: number;

  /** Estimated motion between frames (mean abs diff 0..255). */
  motion?: number;

  /** Foreground ratio in a binary mask (0..1). */
  fgRatio?: number;
  /** Alias for fgRatio (compat). */
  foregroundRatio?: number;
};

export type GuidanceLevel = 'good' | 'warn' | 'bad' | 'info';

export type QualityGuidance = {
  level: GuidanceLevel;
  message: string;
};

export function qualityToGuidance(q: FrameQuality | null | undefined): QualityGuidance[] {
  if (!q) return [{ level: 'info', message: 'No quality metrics yet. Capture a frame or enable live processing.' }];

  const out: QualityGuidance[] = [];

  // Lighting
  if (q.mean < 60) out.push({ level: 'bad', message: 'Too dark. Add more light or increase exposure.' });
  else if (q.mean < 90) out.push({ level: 'warn', message: 'A bit dark. More light will improve edges.' });
  else if (q.mean > 210) out.push({ level: 'bad', message: 'Too bright / overexposed. Reduce glare and exposure.' });
  else if (q.mean > 190) out.push({ level: 'warn', message: 'A bit bright. Reduce reflections for cleaner segmentation.' });

  // Contrast
  if (q.std < 18) out.push({ level: 'bad', message: 'Low contrast. Use a plain, contrasting background (e.g., dark cloth for light pieces).' });
  else if (q.std < 28) out.push({ level: 'warn', message: 'Moderate contrast. A more contrasting background may help.' });

  // Sharpness
  if (typeof q.lapVar === 'number') {
    if (q.lapVar < 35) out.push({ level: 'bad', message: 'Very blurry. Stabilize the camera and ensure focus.' });
    else if (q.lapVar < 80) out.push({ level: 'warn', message: 'Some blur detected. Try to hold still or increase light.' });
  }

  // Motion
  if (typeof q.motion === 'number') {
    if (q.motion > 18) out.push({ level: 'warn', message: 'Motion detected. Lower fps or keep the camera steady.' });
    if (q.motion > 35) out.push({ level: 'bad', message: 'Heavy motion. Live processing may fail—pause movement.' });
  }

  // Foreground ratio
  if (typeof q.fgRatio === 'number') {
    if (q.fgRatio < 0.01) out.push({ level: 'bad', message: 'Almost no foreground detected. Ensure pieces are visible and background contrasts.' });
    else if (q.fgRatio < 0.03) out.push({ level: 'warn', message: 'Very little foreground. Move camera closer or improve contrast.' });
    else if (q.fgRatio > 0.75) out.push({ level: 'bad', message: 'Too much foreground detected. Remove clutter and ensure background is visible.' });
    else if (q.fgRatio > 0.55) out.push({ level: 'warn', message: 'Large foreground area. Pieces may overlap or background is noisy.' });
  }

  if (out.length === 0) out.push({ level: 'good', message: 'Image quality looks good for segmentation.' });
  return out;
}

export function qualityBadge(q: FrameQuality | null | undefined): { label: string; level: GuidanceLevel } {
  if (!q) return { label: 'n/a', level: 'info' };
  const guidance = qualityToGuidance(q);
  const worst = guidance.reduce<GuidanceLevel>((acc, g) => {
    const rank = (l: GuidanceLevel) => (l === 'bad' ? 3 : l === 'warn' ? 2 : l === 'good' ? 1 : 0);
    return rank(g.level) > rank(acc) ? g.level : acc;
  }, 'info');
  return { label: worst === 'bad' ? 'poor' : worst === 'warn' ? 'ok' : worst === 'good' ? 'good' : 'n/a', level: worst };
}


export type FrameQualityStatus = 'good' | 'warn' | 'bad' | 'unknown';

export function frameQualityToStatus(q: FrameQuality | null | undefined): FrameQualityStatus {
  if (!q) return 'unknown';
  const guidance = qualityToGuidance(q);
  const worst = guidance.reduce<'good' | 'warn' | 'bad'>((acc, g) => {
    if (g.level === 'bad') return 'bad';
    if (g.level === 'warn' && acc !== 'bad') return 'warn';
    return acc;
  }, 'good');
  return worst;
}

export type FrameQualityGuidanceItem = { key: string; level: GuidanceLevel; message: string };

export function guidanceFromFrameQuality(
  q: FrameQuality | null | undefined,
  ctx?: { piecesFound?: number; maxPieces?: number }
): FrameQualityGuidanceItem[] {
  const out: FrameQualityGuidanceItem[] = [];

  if (!q) {
    out.push({
      key: 'quality-none',
      level: 'info',
      message: 'No frame quality metrics yet. Start the camera and run segmentation to get feedback.'
    });
  } else {
    out.push(
      ...qualityToGuidance(q).map((g, i) => ({
        key: `quality-${i}-${g.level}`,
        level: g.level,
        message: g.message
      }))
    );
  }

  const piecesFound = ctx?.piecesFound;
  const maxPieces = ctx?.maxPieces;
  if (typeof piecesFound === 'number') {
    if (piecesFound === 0) {
      out.push({
        key: 'pieces-none',
        level: 'warn',
        message: 'No pieces detected. Improve lighting/contrast and ensure pieces do not overlap.'
      });
    } else if (typeof maxPieces === 'number' && piecesFound >= maxPieces) {
      out.push({
        key: 'pieces-max',
        level: 'warn',
        message: 'Many pieces detected (hit the max). Spread pieces out or lower the max pieces limit.'
      });
    }
  }

  // De-duplicate by key while keeping order
  const seen = new Set<string>();
  return out.filter((g) => {
    if (seen.has(g.key)) return false;
    seen.add(g.key);
    return true;
  });
}

