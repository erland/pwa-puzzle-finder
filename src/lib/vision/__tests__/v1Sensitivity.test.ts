import { v1SensitivityToParams } from '../v1Sensitivity';

describe('v1SensitivityToParams', () => {
  it('returns stable presets', () => {
    expect(v1SensitivityToParams('low')).toEqual({
      cannyLow: 80,
      cannyHigh: 160,
      minAreaRatio: 0.002,
      morphKernelSize: 5,
      minSolidity: 0.85,
      maxAspectRatio: 3.5
    });

    expect(v1SensitivityToParams('medium')).toEqual({
      cannyLow: 60,
      cannyHigh: 120,
      minAreaRatio: 0.0015,
      morphKernelSize: 5,
      minSolidity: 0.8,
      maxAspectRatio: 4
    });

    expect(v1SensitivityToParams('high')).toEqual({
      cannyLow: 40,
      cannyHigh: 80,
      minAreaRatio: 0.001,
      morphKernelSize: 7,
      minSolidity: 0.75,
      maxAspectRatio: 5
    });
  });
});
