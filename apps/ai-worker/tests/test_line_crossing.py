"""Unit tests for the ported line-crossing geometry.

These mirror the exact trajectories the old TS simulator used
(startSimulation in the retired worker.ts), confirming the Python port
produces identical IN/OUT decisions for the same inputs.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from geometry.line_crossing import NormalizedLine, Point2D, detect_line_crossing  # noqa: E402

ENTRANCE_LINE = NormalizedLine(x1=0.1, y1=0.5, x2=0.9, y2=0.5)


def test_top_to_bottom_crossing_is_in():
    direction = detect_line_crossing(
        ENTRANCE_LINE, Point2D(0.5, 0.3), Point2D(0.5, 0.7), "TOP_TO_BOTTOM"
    )
    assert direction == "IN"


def test_bottom_to_top_crossing_is_out_under_top_to_bottom_rule():
    direction = detect_line_crossing(
        ENTRANCE_LINE, Point2D(0.5, 0.7), Point2D(0.5, 0.3), "TOP_TO_BOTTOM"
    )
    assert direction == "OUT"


def test_bottom_to_top_rule_inverts_in_out():
    direction_in = detect_line_crossing(
        ENTRANCE_LINE, Point2D(0.5, 0.7), Point2D(0.5, 0.3), "BOTTOM_TO_TOP"
    )
    assert direction_in == "IN"

    direction_out = detect_line_crossing(
        ENTRANCE_LINE, Point2D(0.5, 0.3), Point2D(0.5, 0.7), "BOTTOM_TO_TOP"
    )
    assert direction_out == "OUT"


def test_no_crossing_when_trajectory_does_not_reach_line():
    direction = detect_line_crossing(
        ENTRANCE_LINE, Point2D(0.5, 0.1), Point2D(0.5, 0.3), "TOP_TO_BOTTOM"
    )
    assert direction is None


def test_no_crossing_when_trajectory_stays_on_one_side():
    direction = detect_line_crossing(
        ENTRANCE_LINE, Point2D(0.2, 0.6), Point2D(0.8, 0.9), "TOP_TO_BOTTOM"
    )
    assert direction is None


def test_sampled_point_landing_exactly_on_line_does_not_double_count():
    """Regression test: a continuously-sampled trajectory where one sample lands
    exactly on the line (y == 0.5, common with periodic detection sampling) must
    produce exactly ONE crossing total across the whole walk-through, not two.
    """
    steps = [0.30, 0.40, 0.50, 0.60, 0.70]  # one sample lands exactly on the line
    directions = []
    for i in range(1, len(steps)):
        d = detect_line_crossing(
            ENTRANCE_LINE, Point2D(0.5, steps[i - 1]), Point2D(0.5, steps[i]), "TOP_TO_BOTTOM"
        )
        if d:
            directions.append(d)
    assert directions == ["IN"]


def test_left_to_right_rule():
    vertical_line = NormalizedLine(x1=0.5, y1=0.1, x2=0.5, y2=0.9)
    direction = detect_line_crossing(
        vertical_line, Point2D(0.3, 0.5), Point2D(0.7, 0.5), "LEFT_TO_RIGHT"
    )
    assert direction == "IN"

    direction_out = detect_line_crossing(
        vertical_line, Point2D(0.7, 0.5), Point2D(0.3, 0.5), "LEFT_TO_RIGHT"
    )
    assert direction_out == "OUT"
