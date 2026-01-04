import { estimateOverlap, overlapLooksHeavy } from '../overlap';

describe('overlap heuristics', () => {
  it('reports no overlap for disjoint boxes', () => {
    const est = estimateOverlap({
      boxes: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 20, width: 10, height: 10 }
      ]
    });

    expect(est.overlappingPairs).toBe(0);
    expect(est.maxOverlapFraction).toBe(0);
    expect(overlapLooksHeavy({ boxes: [{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 }] })).toBe(false);
  });

  it('flags heavy overlap when many boxes overlap substantially', () => {
    const boxes = [
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 5, y: 5, width: 20, height: 20 },
      { x: 8, y: 8, width: 20, height: 20 },
      { x: 12, y: 12, width: 20, height: 20 }
    ];

    const est = estimateOverlap({ boxes });
    expect(est.overlappingPairs).toBeGreaterThan(0);
    expect(est.maxOverlapFraction).toBeGreaterThan(0.2);
    expect(overlapLooksHeavy({ boxes, minPairs: 1 })).toBe(true);
  });
});
