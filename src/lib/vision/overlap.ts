export type BBox = { x: number; y: number; width: number; height: number };

export type OverlapEstimate = {
  /** Number of pairs that overlap beyond the threshold. */
  overlappingPairs: number;
  /** Max overlap fraction (intersection/min(areaA, areaB)) across all pairs. */
  maxOverlapFraction: number;
  /** Number of bbox pairs checked (may be capped). */
  comparisons: number;
};

function area(b: BBox): number {
  return Math.max(0, b.width) * Math.max(0, b.height);
}

function intersectionArea(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

/**
 * Very lightweight overlap heuristic.
 *
 * We intentionally keep this simple and conservative:
 * - Uses bounding boxes (fast)
 * - Reports overlap in terms of intersection relative to the smaller box
 */
export function estimateOverlap(params: {
  boxes: BBox[];
  /** Max pair comparisons to avoid worst-case quadratic cost. */
  maxComparisons?: number;
  /** Consider a pair "overlapping" if intersection covers this fraction of the smaller box. */
  overlapFractionThreshold?: number;
}): OverlapEstimate {
  const { boxes } = params;
  const maxComparisons = params.maxComparisons ?? 15_000;
  const overlapFractionThreshold = params.overlapFractionThreshold ?? 0.18;

  let overlappingPairs = 0;
  let maxOverlapFraction = 0;
  let comparisons = 0;

  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    const aArea = area(a);
    if (aArea <= 0) continue;
    for (let j = i + 1; j < boxes.length; j++) {
      if (comparisons >= maxComparisons) {
        return { overlappingPairs, maxOverlapFraction, comparisons };
      }
      comparisons++;
      const b = boxes[j];
      const bArea = area(b);
      if (bArea <= 0) continue;

      const inter = intersectionArea(a, b);
      if (inter <= 0) continue;

      const frac = inter / Math.min(aArea, bArea);
      if (frac > maxOverlapFraction) maxOverlapFraction = frac;
      if (frac >= overlapFractionThreshold) overlappingPairs++;
    }
  }

  return { overlappingPairs, maxOverlapFraction, comparisons };
}

export function overlapLooksHeavy(params: {
  boxes: BBox[];
  /** Minimum number of overlapping pairs before warning. */
  minPairs?: number;
}): boolean {
  const { boxes } = params;
  if (boxes.length < 2) return false;
  const est = estimateOverlap({ boxes });
  const minPairs = params.minPairs ?? Math.max(2, Math.floor(boxes.length * 0.06));
  return est.overlappingPairs >= minPairs || est.maxOverlapFraction >= 0.42;
}
