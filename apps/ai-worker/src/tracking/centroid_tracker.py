"""Minimal centroid-distance multi-object tracker.

theaft-ai's pipeline only needed "is a person currently inside this zone" (per-frame,
no identity). Footfall counting needs more: it must follow the SAME person across
frames to know which direction their trajectory crossed the line, otherwise two
different people on opposite sides of the line in one frame would look like a
crossing. This tracker is the piece that didn't exist upstream and had to be
written fresh for this project.

Algorithm: greedy nearest-centroid matching frame-to-frame (no Kalman filter / IOU —
deliberately simple and dependency-free, adequate for a small number of people
in frame at low-FPS sampling). A track that goes unmatched for `max_missed`
consecutive detection cycles is dropped.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

Point = Tuple[float, float]


@dataclass
class Track:
    track_id: int
    centroid: Point
    prev_centroid: Optional[Point] = None
    missed_count: int = 0


class CentroidTracker:
    # A fixed pixel distance only makes sense for one specific frame resolution and
    # detection rate. A person near a 1080p/4K camera can cover 150-250px between two
    # 0.5s-apart detection samples - well past a 120px fixed threshold - so the match
    # radius is derived from the actual frame width each call instead (see `update`'s
    # `frame_width`); DEFAULT_MAX_DISTANCE_FRACTION is "how much of the frame width a
    # person may move between samples and still count as the same track".
    DEFAULT_MAX_DISTANCE_FRACTION = 0.12
    FALLBACK_MAX_DISTANCE = 120.0  # used only if frame_width is never supplied

    def __init__(
        self,
        max_distance: Optional[float] = None,
        max_distance_fraction: float = DEFAULT_MAX_DISTANCE_FRACTION,
        max_missed: int = 5,
    ):
        # Explicit max_distance (e.g. from a test, or a caller that already knows its
        # resolution) always wins; otherwise it's derived per-call from frame_width.
        self.max_distance = max_distance
        self.max_distance_fraction = max_distance_fraction
        self.max_missed = max_missed
        self._next_id = 1
        self.tracks: Dict[int, Track] = {}

    def update(self, centroids: List[Point], frame_width: Optional[float] = None) -> Dict[int, Track]:
        """Advances the tracker by one detection cycle.

        `frame_width` (in the same pixel units as `centroids`) lets the match radius
        scale with the stream's actual resolution; omit it to keep a fixed threshold
        (either the explicit `max_distance` passed to `__init__`, or the old 120px
        default), which is what the unit tests below do with small, fixed coordinates.

        Returns the full set of currently-live tracks (including ones just created
        this call, whose prev_centroid is None — callers should skip those for
        crossing checks, since a single point has no direction yet).
        """
        if self.max_distance is not None:
            effective_max_distance = self.max_distance
        elif frame_width:
            effective_max_distance = frame_width * self.max_distance_fraction
        else:
            effective_max_distance = self.FALLBACK_MAX_DISTANCE

        unmatched_detections = set(range(len(centroids)))
        matched_track_ids = set()

        # Greedy nearest-neighbor matching, closest pairs first.
        candidate_pairs = []
        for track_id, track in self.tracks.items():
            for det_idx in unmatched_detections:
                dist = _euclidean(track.centroid, centroids[det_idx])
                if dist <= effective_max_distance:
                    candidate_pairs.append((dist, track_id, det_idx))
        candidate_pairs.sort(key=lambda p: p[0])

        for _dist, track_id, det_idx in candidate_pairs:
            if track_id in matched_track_ids or det_idx not in unmatched_detections:
                continue
            track = self.tracks[track_id]
            track.prev_centroid = track.centroid
            track.centroid = centroids[det_idx]
            track.missed_count = 0
            matched_track_ids.add(track_id)
            unmatched_detections.discard(det_idx)

        # Age out tracks that weren't matched this cycle.
        for track_id, track in list(self.tracks.items()):
            if track_id not in matched_track_ids:
                track.missed_count += 1
                track.prev_centroid = None  # broke continuity; don't check crossing on next match
                if track.missed_count > self.max_missed:
                    del self.tracks[track_id]

        # Remaining unmatched detections start new tracks.
        for det_idx in unmatched_detections:
            track_id = self._next_id
            self._next_id += 1
            self.tracks[track_id] = Track(track_id=track_id, centroid=centroids[det_idx])

        return self.tracks


def _euclidean(a: Point, b: Point) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
