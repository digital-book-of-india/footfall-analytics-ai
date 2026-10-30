"""Checks detections against a camera's owner-drawn security zone polygon.

Ported from the sibling theaft-ai project (apps/ai-worker/src/zones/zone_loader.py) — this
footfall worker's zone format is the same normalized-0..1 polygon (see apps/api's Zone model),
just plugged into the per-camera detection loop in main.py alongside line-crossing counting
instead of running on its own.
"""

import os
from typing import List, Optional, Tuple

import cv2
import numpy as np

Point = Tuple[float, float]

# How much of the person must be inside the zone, and how tall they must be (share of the picture height).
MIN_ZONE_OVERLAP = float(os.environ.get("MIN_ZONE_OVERLAP", "0"))  # 0 = off; the feet / centre test decides
MIN_PERSON_HEIGHT = float(os.environ.get("MIN_PERSON_HEIGHT", "0.25"))
# A detection this much like a box the owner called a false alarm is ignored.
IGNORE_REGION_IOU = float(os.environ.get("IGNORE_REGION_IOU", "0.4"))


def point_in_polygon(point: Point, polygon: List[dict]) -> bool:
    """Ray-casting point-in-polygon test. Polygon points are {"x": 0..1, "y": 0..1}."""
    if len(polygon) < 3:
        return False
    x, y = point
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]["x"], polygon[i]["y"]
        xj, yj = polygon[j]["x"], polygon[j]["y"]
        intersects = ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


def bbox_center_normalized(bbox: Tuple[int, int, int, int], frame_w: int, frame_h: int) -> Point:
    x, y, w, h = bbox
    cx = (x + w / 2) / frame_w
    cy = (y + h / 2) / frame_h
    return (cx, cy)


def zone_overlap(bbox: Tuple[int, int, int, int], frame_w: int, frame_h: int, zone: dict) -> float:
    """Share (0..1) of the person's box that lies inside the zone polygon."""
    polygon = zone.get("polygon") or []
    if len(polygon) < 3:
        return 0.0
    scale = 4  # a quarter-size mask is plenty for a ratio
    mw, mh = max(1, frame_w // scale), max(1, frame_h // scale)
    mask = np.zeros((mh, mw), dtype=np.uint8)
    pts = np.array([[int(p["x"] * mw), int(p["y"] * mh)] for p in polygon], dtype=np.int32)
    cv2.fillPoly(mask, [pts], 1)
    x, y, w, h = bbox
    x0, y0 = max(0, x // scale), max(0, y // scale)
    x1, y1 = min(mw, (x + w) // scale), min(mh, (y + h) // scale)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    return float(mask[y0:y1, x0:x1].sum()) / float((x1 - x0) * (y1 - y0))


def feet_position(bbox: Tuple[int, int, int, int], frame_w: int, frame_h: int) -> Point:
    """Where the person stands: bottom middle of their box, as a share of the picture."""
    x, y, w, h = bbox
    return (min(0.999, max(0.0, (x + w / 2) / frame_w)), min(0.999, max(0.0, (y + h) / frame_h)))


def is_in_zone(bbox: Tuple[int, int, int, int], frame_w: int, frame_h: int, zone: Optional[dict]) -> bool:
    if not zone or not zone.get("enabled", False):
        return False
    polygon = zone.get("polygon") or []
    # Where they stand (feet) is what matters when the zone is drawn on the floor in front of the shutter;
    # the middle of the person covers a zone drawn on the shutter itself.
    if not (
        point_in_polygon(feet_position(bbox, frame_w, frame_h), polygon)
        or point_in_polygon(bbox_center_normalized(bbox, frame_w, frame_h), polygon)
    ):
        return False
    if MIN_ZONE_OVERLAP > 0 and zone_overlap(bbox, frame_w, frame_h, zone) < MIN_ZONE_OVERLAP:
        return False
    # Big enough in the picture to be a person, not a small false match.
    return bbox[3] / frame_h >= MIN_PERSON_HEIGHT


def box_overlap_ratio(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> float:
    """Intersection over union of two (x, y, w, h) boxes."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix, iy = max(ax, bx), max(ay, by)
    iw, ih = min(ax + aw, bx + bw) - ix, min(ay + ah, by + bh) - iy
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    return inter / (aw * ah + bw * bh - inter)


def matches_ignored(bbox: Tuple[int, int, int, int], frame_w: int, frame_h: int, regions: Optional[list]) -> bool:
    """True if the box sits where the owner marked an earlier alert as a false alarm."""
    if not regions:
        return False
    x, y, w, h = bbox
    box = (x / frame_w, y / frame_h, w / frame_w, h / frame_h)
    return any(
        box_overlap_ratio(box, (r["x"], r["y"], r["w"], r["h"])) >= IGNORE_REGION_IOU for r in regions
    )
