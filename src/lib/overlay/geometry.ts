export type Point = { x: number; y: number };

/**
 * Returns true if the point (x,y) is inside the polygon using a ray-casting algorithm.
 * Polygon points are assumed to be in the same coordinate space as the test point.
 */
export function pointInPolygon(x: number, y: number, poly: Point[]): boolean {
  if (!poly || poly.length < 3) return false;

  // Ray-casting algorithm
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    // Add a tiny epsilon in the denominator to avoid division by zero on horizontal edges.
    const intersect =
      (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0000001) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}
