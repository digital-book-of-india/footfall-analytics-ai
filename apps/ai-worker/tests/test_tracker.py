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


def test_frame_width_scales_match_radius_for_high_resolution_streams():
    """Regression test: on a 1080p stream a fast walker can move ~150-250px between
    two 0.5s-apart samples. With no explicit max_distance, the tracker must derive a
    radius from the frame width (not the old fixed 120px) so this match still succeeds."""
    tracker = CentroidTracker()  # no explicit max_distance - must derive from frame_width

    tracker.update([(200.0, 540.0)], frame_width=1920)
    # 1920 * 0.12 (default fraction) = 230.4px radius - comfortably covers a 200px hop.
    tracks = tracker.update([(400.0, 540.0)], frame_width=1920)

    assert len(tracks) == 1  # matched as the same person, not a new track
    track = next(iter(tracks.values()))
    assert track.prev_centroid == (200.0, 540.0)


def test_frame_width_scaling_still_rejects_an_implausibly_large_jump():
    tracker = CentroidTracker()

    tracker.update([(10.0, 10.0)], frame_width=640)
    # 640 * 0.12 = 76.8px radius - a 600px jump is still a different person.
    tracks = tracker.update([(610.0, 10.0)], frame_width=640)

    assert len(tracks) == 2


def test_explicit_max_distance_overrides_frame_width_scaling():
    """An explicit max_distance (as every other test in this file uses) must behave
    exactly as before, ignoring frame_width entirely - this is what keeps all the
    fixed-coordinate tests above working unchanged."""
    tracker = CentroidTracker(max_distance=50)

    tracker.update([(0.0, 0.0)], frame_width=4000)  # huge frame_width, should be ignored
    tracks = tracker.update([(100.0, 0.0)], frame_width=4000)  # 100px > explicit 50px cap

    assert len(tracks) == 2  # NOT matched - explicit max_distance=50 still wins
