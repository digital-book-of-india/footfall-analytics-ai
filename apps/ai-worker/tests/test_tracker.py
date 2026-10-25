"""Unit tests for the centroid tracker (the new piece that doesn't exist in
the theaft-ai source — theft detection only needed per-frame zone presence,
not cross-frame identity, so this had to be written fresh for footfall counting).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from tracking.centroid_tracker import CentroidTracker  # noqa: E402


def test_same_person_keeps_same_track_id_across_small_moves():
    tracker = CentroidTracker(max_distance=50)

    tracks_1 = tracker.update([(100.0, 100.0)])
    assert len(tracks_1) == 1
    track_id = next(iter(tracks_1))
    assert tracks_1[track_id].prev_centroid is None  # first sighting, no trajectory yet

    tracks_2 = tracker.update([(110.0, 130.0)])  # moved a bit, same person
    assert len(tracks_2) == 1
    assert track_id in tracks_2
    assert tracks_2[track_id].prev_centroid == (100.0, 100.0)
    assert tracks_2[track_id].centroid == (110.0, 130.0)


def test_far_away_detection_starts_a_new_track():
    tracker = CentroidTracker(max_distance=50)

    tracker.update([(50.0, 50.0)])
    tracks = tracker.update([(500.0, 500.0)])  # far away: not the same person

    # original track aged (missed), new track created for the far detection
    assert len(tracks) == 2


def test_track_dropped_after_max_missed_cycles():
    tracker = CentroidTracker(max_distance=50, max_missed=2)

    tracker.update([(10.0, 10.0)])
    original_id = next(iter(tracker.tracks))

    tracker.update([])  # missed 1
    tracker.update([])  # missed 2
    tracker.update([])  # missed 3 -> dropped

    assert original_id not in tracker.tracks


def test_two_people_tracked_independently():
    tracker = CentroidTracker(max_distance=50)

    tracks = tracker.update([(10.0, 10.0), (400.0, 400.0)])
    assert len(tracks) == 2

    tracks_2 = tracker.update([(20.0, 25.0), (410.0, 420.0)])
    assert len(tracks_2) == 2
    for track in tracks_2.values():
        assert track.prev_centroid is not None
