import { computeCountsFromClasses, normalizeLegacyClass } from '../scanModel';

describe('scanModel', () => {
  it('normalizes legacy values', () => {
    expect(normalizeLegacyClass('corner')).toBe('corner');
    expect(normalizeLegacyClass('edge')).toBe('edge');
    expect(normalizeLegacyClass('nonEdge')).toBe('nonEdge');
    expect(normalizeLegacyClass('unknown')).toBe('unknown');
    expect(normalizeLegacyClass('interior')).toBe('nonEdge');
    expect(normalizeLegacyClass('')).toBeUndefined();
    expect(normalizeLegacyClass(undefined)).toBeUndefined();
  });

  it('computes counts', () => {
    const c = computeCountsFromClasses(['corner', 'corner', 'edge', 'unknown', 'nonEdge', 'nonEdge']);
    expect(c).toEqual({ corners: 2, edges: 1, nonEdge: 2, unknown: 1, total: 6 });
  });
});
