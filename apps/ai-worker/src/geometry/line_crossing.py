"""Virtual counting-line crossing detection.

Ported 1:1 from the original TypeScript implementation
(previously apps/ai-worker/src/geometry/lineCrossing.ts) so the counting
rule stays identical now that detection runs for real instead of being simulated.
"""

from typing import NamedTuple, Optional


class Point2D(NamedTuple):
    x: float
    y: float


class NormalizedLine(NamedTuple):
    x1: float
    y1: float
    x2: float
    y2: float


def _cross_product(a: Point2D, b: Point2D, c: Point2D) -> float:
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)


def _on_segment(a: Point2D, b: Point2D, c: Point2D) -> bool:
    return (
        c.x <= max(a.x, b.x)
        and c.x >= min(a.x, b.x)
        and c.y <= max(a.y, b.y)
        and c.y >= min(a.y, b.y)
    )


def check_segment_intersection(a: Point2D, b: Point2D, c: Point2D, d: Point2D) -> bool:
    """Determines whether two 2D line segments AB and CD intersect."""
    d1 = _cross_product(c, d, a)
    d2 = _cross_product(c, d, b)
    d3 = _cross_product(a, b, c)
    d4 = _cross_product(a, b, d)

    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and (
        (d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)
    ):
        return True

    # Collinear edge cases
    if d1 == 0 and _on_segment(c, d, a):
        return True
    if d2 == 0 and _on_segment(c, d, b):
        return True
    if d3 == 0 and _on_segment(a, b, c):
        return True
    if d4 == 0 and _on_segment(a, b, d):
        return True

    return False


def detect_line_crossing(
    virtual_line: NormalizedLine,
    prev_point: Point2D,
    curr_point: Point2D,
    in_direction: str = "IN",
    out_direction: str = "OUT",
) -> Optional[str]:
    """Detects if a person trajectory segment (prev -> curr) crossed the virtual
    counting line. If crossed, returns the `in_direction` or `out_direction` label.

    The owner app's CountingLineCanvas draws its "in" arrow along the line's
    perpendicular normal vector (-dy, dx) from A(x1,y1) to B(x2,y2), and labels
    that side with whatever `inDirection` ("IN" or "OUT") the owner picked - the
    same label is what gets saved and sent here. `_cross_product(line_start,
    line_end, curr_point) > 0` is true for a point on exactly that (-dy, dx) side
    (same (x,y) axes, same origin, same A->B order as the canvas), so using its
    sign directly keeps the AI worker's count in sync with whatever the owner
    actually sees drawn in the UI - no separate cardinal-direction mapping that
    could silently disagree with it, and no dependency on which endpoint the
    owner happened to drag first.
    """
    line_start = Point2D(virtual_line.x1, virtual_line.y1)
    line_end = Point2D(virtual_line.x2, virtual_line.y2)

    if not check_segment_intersection(line_start, line_end, prev_point, curr_point):
        return None

    cp = _cross_product(line_start, line_end, curr_point)

    # curr_point landing exactly ON the line (cp == 0, e.g. a sampled centroid that
    # happens to fall right on the counting line) is ambiguous, not a crossing:
    # without this guard, the leg ending on the line fires once, and the very next
    # leg leaving the line fires again for the same physical walk-through, double-
    # counting a single person as two crossings.
    if cp == 0:
        return None

    return in_direction if cp > 0 else out_direction
