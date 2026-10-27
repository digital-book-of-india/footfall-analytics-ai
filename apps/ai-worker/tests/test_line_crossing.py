"""Unit tests for the line-crossing geometry.

`detect_line_crossing` must agree with exactly what the owner app's
CountingLineCanvas draws: the "in" label is drawn along the line's
perpendicular normal (-dy, dx) from point A(x1,y1) to B(x2,y2), and that same
label is saved as `inDirection`. These tests check the cross-product sign
convention directly (not cardinal directions), including that re-drawing the
same physical line with its endpoints swapped flips the result consistently
with how the UI's own arrow would flip too - the worker and the UI must never
silently disagree about which side is "in".
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from geometry.line_crossing import NormalizedLine, Point2D, detect_line_crossing  # noqa: E402

# A horizontal entrance line, drawn left-to-right (A=(0.1,0.5) -> B=(0.9,0.5)).
# Its normal (-dy,dx) = (0,1) points toward larger y (downward in image coords),
# so by default ("IN"/"OUT" labels, unchanged from the UI's own defaults) a
# trajectory ending further down the frame is "IN".
ENTRANCE_LINE = NormalizedLine(x1=0.1, y1=0.5, x2=0.9, y2=0.5)


def test_downward_crossing_is_in_by_default():
    direction = detect_line_crossing(ENTRANCE_LINE, Point2D(0.5, 0.3), Point2D(0.5, 0.7))
    assert direction == "IN"


def test_upward_crossing_is_out_by_default():
    direction = detect_line_crossing(ENTRANCE_LINE, Point2D(0.5, 0.7), Point2D(0.5, 0.3))
    assert direction == "OUT"


def test_swapped_in_out_labels_are_honoured():
    """An owner who flipped the IN/OUT dropdowns in the UI (same line, same
    drawing) must get the opposite result from the AI worker, since the UI's
    own arrow for that side is now labelled the other way."""
    direction = detect_line_crossing(
        ENTRANCE_LINE, Point2D(0.5, 0.3), Point2D(0.5, 0.7), in_direction="OUT", out_direction="IN"
    )
    assert direction == "OUT"


def test_redrawing_the_line_with_swapped_endpoints_flips_consistently_with_the_normal():
    """Same physical line, but saved as B->A instead of A->B (e.g. the owner
    dragged the other handle first). The normal vector flips, so a downward
    walker now lands on the side still labelled "IN" by default - exactly
    matching what the UI's arrow would show for this endpoint order, not a
    silently wrong opposite count."""
    reversed_line = NormalizedLine(x1=0.9, y1=0.5, x2=0.1, y2=0.5)
    direction = detect_line_crossing(reversed_line, Point2D(0.5, 0.3), Point2D(0.5, 0.7))
    assert direction == "OUT"  # normal now points upward, so downward = the "OUT" side


def test_no_crossing_when_trajectory_does_not_reach_line():
    direction = detect_line_crossing(ENTRANCE_LINE, Point2D(0.5, 0.1), Point2D(0.5, 0.3))
    assert direction is None


def test_no_crossing_when_trajectory_stays_on_one_side():
    direction = detect_line_crossing(ENTRANCE_LINE, Point2D(0.2, 0.6), Point2D(0.8, 0.9))
    assert direction is None


def test_sampled_point_landing_exactly_on_line_does_not_double_count():
    """Regression test: a continuously-sampled trajectory where one sample lands
    exactly on the line (y == 0.5, common with periodic detection sampling) must
    produce exactly ONE crossing total across the whole walk-through, not two.
    """
    steps = [0.30, 0.40, 0.50, 0.60, 0.70]  # one sample lands exactly on the line
    directions = []
    for i in range(1, len(steps)):
        d = detect_line_crossing(ENTRANCE_LINE, Point2D(0.5, steps[i - 1]), Point2D(0.5, steps[i]))
        if d:
            directions.append(d)
    assert directions == ["IN"]


def test_vertical_line_left_to_right_walker():
    # A=(0.5,0.1) -> B=(0.5,0.9): normal (-dy,dx) = (-0.8,0)/len -> points toward
    # smaller x (left), so a walker ending further LEFT is "IN" by default here.
    vertical_line = NormalizedLine(x1=0.5, y1=0.1, x2=0.5, y2=0.9)
    direction = detect_line_crossing(vertical_line, Point2D(0.7, 0.5), Point2D(0.3, 0.5))
    assert direction == "IN"

    direction_out = detect_line_crossing(vertical_line, Point2D(0.3, 0.5), Point2D(0.7, 0.5))
    assert direction_out == "OUT"
