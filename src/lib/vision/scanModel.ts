import type { FrameQuality } from './quality';

/**
 * Shared vision result model used across main-thread and worker paths.
 *
 * v1 needs a stable shape so UI/overlay/quality logic doesn't depend on
 * which pipeline ran (segment/extract/classify) or where it ran.
 */

// Note: we keep the set small and user-facing.
export type PieceClass = 'corner' | 'edge' | 'nonEdge' | 'unknown';

export type ScanCounts = {
  corners: number;
  edges: number;
  nonEdge: number;
  unknown: number;
  total: number;
};

export type DetectedPiece = {
  id: number;
  bboxSource: { x: number; y: number; width: number; height: number };
  contourSource: Array<{ x: number; y: number }>;

  /** v1 classification. */
  class: PieceClass;
  /** 0..1 confidence (heuristic). Optional for now. */
  confidence?: number;
  debug?: string;
};

export type ScanResult = {
  pieces: DetectedPiece[];
  counts: ScanCounts;
  quality?: FrameQuality;
  debugText?: string;
};

export function normalizeLegacyClass(v: string | undefined | null): PieceClass | undefined {
  if (!v) return undefined;
  if (v === 'corner' || v === 'edge' || v === 'nonEdge' || v === 'unknown') return v;
  // Legacy (Step 2) value
  if (v === 'interior') return 'nonEdge';
  return undefined;
}

export function computeCountsFromClasses(classes: Iterable<PieceClass>): ScanCounts {
  let corners = 0;
  let edges = 0;
  let nonEdge = 0;
  let unknown = 0;
  let total = 0;

  for (const c of classes) {
    total++;
    if (c === 'corner') corners++;
    else if (c === 'edge') edges++;
    else if (c === 'nonEdge') nonEdge++;
    else unknown++;
  }

  return { corners, edges, nonEdge, unknown, total };
}
