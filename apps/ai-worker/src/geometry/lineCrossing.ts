import { NormalizedCoordinates, Direction } from '@dbi/shared-types';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Calculates 2D cross product of vectors (B - A) and (C - A)
 */
function crossProduct(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Checks if point C is on segment AB (assuming collinear)
 */
function onSegment(a: Point2D, b: Point2D, c: Point2D): boolean {
  return (
    c.x <= Math.max(a.x, b.x) &&
    c.x >= Math.min(a.x, b.x) &&
    c.y <= Math.max(a.y, b.y) &&
    c.y >= Math.min(a.y, b.y)
  );
}

/**
 * Determines whether two 2D line segments AB and CD intersect
 */
export function checkSegmentIntersection(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D
): boolean {
  const d1 = crossProduct(c, d, a);
  const d2 = crossProduct(c, d, b);
  const d3 = crossProduct(a, b, c);
  const d4 = crossProduct(a, b, d);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }

  // Collinear edge cases
  if (d1 === 0 && onSegment(c, d, a)) return true;
  if (d2 === 0 && onSegment(c, d, b)) return true;
  if (d3 === 0 && onSegment(a, b, c)) return true;
  if (d4 === 0 && onSegment(a, b, d)) return true;

  return false;
}

/**
 * Detects if a person trajectory segment (prevPoint -> currPoint) crossed the virtual counting line.
 * If crossed, calculates crossing direction ('IN' vs 'OUT') based on vector orientation.
 */
export function detectLineCrossing(
  virtualLine: NormalizedCoordinates,
  prevPoint: Point2D,
  currPoint: Point2D,
  inDirectionRule = 'TOP_TO_BOTTOM'
): Direction | null {
  const lineStart: Point2D = { x: virtualLine.x1, y: virtualLine.y1 };
  const lineEnd: Point2D = { x: virtualLine.x2, y: virtualLine.y2 };

  // Check if trajectory crossed virtual line
  const intersects = checkSegmentIntersection(lineStart, lineEnd, prevPoint, currPoint);
  if (!intersects) {
    return null;
  }

  // Orientation of movement vector relative to virtual line vector
  const cp = crossProduct(lineStart, lineEnd, currPoint);

  if (inDirectionRule === 'TOP_TO_BOTTOM') {
    // If movement is downwards across horizontal line
    return cp > 0 ? 'IN' : 'OUT';
  } else if (inDirectionRule === 'BOTTOM_TO_TOP') {
    return cp < 0 ? 'IN' : 'OUT';
  } else if (inDirectionRule === 'LEFT_TO_RIGHT') {
    return currPoint.x > prevPoint.x ? 'IN' : 'OUT';
  } else {
    return currPoint.x < prevPoint.x ? 'IN' : 'OUT';
  }
}
