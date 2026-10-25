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
    def __init__(self, max_distance: float = 120.0, max_missed: int = 5):
        self.max_distance = max_distance
        self.max_missed = max_missed
        self._next_id = 1
        self.tracks: Dict[int, Track] = {}

    def update(self, centroids: List[Point]) -> Dict[int, Track]:
        """Advances the tracker by one detection cycle.

        Returns the full set of currently-live tracks (including ones just created
        this call, whose prev_centroid is None — callers should skip those for
        crossing checks, since a single point has no direction yet).
        """
        unmatched_detections = set(range(len(centroids)))
        matched_track_ids = set()

        # Greedy nearest-neighbor matching, closest pairs first.
        candidate_pairs = []
        for track_id, track in self.tracks.items():
            for det_idx in unmatched_detections:
                dist = _euclidean(track.centroid, centroids[det_idx])
                if dist <= self.max_distance:
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
