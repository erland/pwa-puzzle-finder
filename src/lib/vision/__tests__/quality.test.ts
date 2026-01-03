import { frameQualityToStatus, guidanceFromFrameQuality, type FrameQuality } from '../quality';

function makeQuality(overrides: Partial<FrameQuality> = {}): FrameQuality {
  return {
    width: 1280,
    height: 720,
    mean: 120,
    std: 45,
    lapVar: 120,
    motion: 0.05,
    fgRatio: 0.12,
    foregroundRatio: 0.12,
    ...overrides
  };
}

describe('quality', () => {
  it('returns good for a healthy frame', () => {
    const q = makeQuality();
    expect(frameQualityToStatus(q)).toBe('good');
  });

  it('returns bad when focus (lapVar) is very low', () => {
    const q = makeQuality({ lapVar: 10 });
    expect(frameQualityToStatus(q)).toBe('bad');
  });

  it('returns warn when contrast is low (std)', () => {
    // In current heuristics: std < 18 => bad, std < 28 => warn.
    const q = makeQuality({ std: 22 });
    expect(frameQualityToStatus(q)).toBe('warn');
  });

  it('returns warn when motion is high', () => {
    // In current heuristics: motion > 18 => warn, motion > 35 => bad.
    const q = makeQuality({ motion: 20 });
    expect(frameQualityToStatus(q)).toBe('warn');
  });

  it('produces guidance items with stable keys', () => {
    const q = makeQuality({ std: 10, lapVar: 10 });
    const items = guidanceFromFrameQuality(q, { piecesFound: 0, maxPieces: 64 });
    expect(Array.isArray(items)).toBe(true);
    // Each item should have a key + message + level.
    for (const it of items) {
      expect(typeof it.key).toBe('string');
      expect(it.key.length).toBeGreaterThan(0);
      expect(typeof it.message).toBe('string');
      expect(it.message.length).toBeGreaterThan(0);
      expect(['good', 'info', 'warn', 'bad']).toContain(it.level);
    }
  });
});
