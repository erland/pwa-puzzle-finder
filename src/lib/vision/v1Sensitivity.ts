export type V1Sensitivity = 'low' | 'medium' | 'high';

export type V1SensitivityParams = {
  // Segmentation
  minAreaRatio: number;
  morphKernelSize: number;

  // Classification (Canny defaults used in classifier/worker)
  cannyLow: number;
  cannyHigh: number;

  // Extraction filters
  minSolidity: number;
  maxAspectRatio: number;
};

/**
 * Maps the single v1 user-facing sensitivity control to internal thresholds.
 *
 * These are intentionally coarse presets so behavior is predictable.
 * Keep this function PURE and unit-tested.
 */
export function v1SensitivityToParams(level: V1Sensitivity): V1SensitivityParams {
  if (level === 'low') {
    return {
      cannyLow: 80,
      cannyHigh: 160,
      minAreaRatio: 0.0020,
      morphKernelSize: 5,
      minSolidity: 0.85,
      maxAspectRatio: 3.5
    };
  }
  if (level === 'high') {
    return {
      cannyLow: 40,
      cannyHigh: 80,
      minAreaRatio: 0.0010,
      morphKernelSize: 7,
      minSolidity: 0.75,
      maxAspectRatio: 5.0
    };
  }
  // medium
  return {
    cannyLow: 60,
    cannyHigh: 120,
    minAreaRatio: 0.0015,
    morphKernelSize: 5,
    minSolidity: 0.8,
    maxAspectRatio: 4.0
  };
}
