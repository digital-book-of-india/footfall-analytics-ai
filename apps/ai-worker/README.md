# @dbi/ai-worker (Python)

Real video-processing worker that does two independent things per camera, both off
the same detector:

1. **Footfall counting** — tracks people across frames (`tracking/centroid_tracker.py`)
   and counts a crossing whenever a tracked person's trajectory crosses the shop's
   configured virtual counting line, submitting `IN`/`OUT` events.
2. **Zone watching** — checks each detection against the shop's configured security
   zone polygon (e.g. a shutter or gate) and raises `PERSON_IN_ZONE` /
   `POSSIBLE_SHUTTER_INTERACTION` alerts, with a red-boxed evidence snapshot, once
   someone has stood there long enough (`heuristics/classifier.py`). Ported from the
   sibling `theaft-ai` project's zone/evidence pipeline (`zones/`, `heuristics/`,
   `reporting/`, `detection/background.py`, `detection/face_check.py`).

A camera can have a counting line, a zone, both, or neither — `main.py`'s
`_watch_camera()` runs whichever is enabled; `_watch_zone()` holds the zone path.

Originally this package was a TypeScript stub that only emitted synthetic simulated
events on a timer; it never touched a real frame. The Python + OpenCV rewrite started
from the sibling `theaft-ai` project's working stream-reading and person-detection
pipeline. `src/tracking/centroid_tracker.py` is the one piece theaft-ai never needed —
zone watching only needs per-frame "is a person in this polygon", footfall counting
needs an actual cross-frame trajectory to know direction.

## Layout

```
src/
  main.py                      orchestrator: discover cameras, one watcher thread per camera
  client.py                    HTTP client for /internal/v1/footfall/* (x-ai-secret auth)
  config.py                    env-driven config
  stream/reader.py             opens RTSP/file/webcam source, reconnects on drop, loops local clips
  detection/person_detector.py YOLOX-tiny (ONNX, via cv2.dnn) person detector, HOG+SVM fallback
  detection/background.py      empty-scene model — tells an arriving person from a poster/mannequin
  detection/face_check.py      YuNet face check — alerts only for a person facing away from camera
  detection/models/            yolox_tiny.onnx + face_detection_yunet_2023mar.onnx (gitignored; see
                                scripts/prepare_models.py)
  tracking/centroid_tracker.py greedy nearest-centroid multi-object tracker (new, not in theaft-ai)
  geometry/line_crossing.py    virtual-line crossing + IN/OUT direction (ported from the old TS worker)
  zones/zone_loader.py         point-in-polygon zone membership + false-alarm ignore-region check
  heuristics/classifier.py     dwell-time + cooldown state machine -> PERSON_IN_ZONE / SHUTTER_INTERACTION
  reporting/snapshot.py        annotated (red box + blue zone outline) evidence JPEG encoding
scripts/
  prepare_models.py            downloads the two ONNX models above (sha256-pinned)
tests/
  test_line_crossing.py        unit tests for the crossing geometry
  test_tracker.py              unit tests for the centroid tracker
  smoke_single_camera.py       manual live smoke test against one real camera (talks to a running backend)
```

## Which cameras this worker processes

`GET /internal/v1/footfall/cameras` returns every camera except
`connectionType: MOCK_STREAM` — mock-stream cameras are intentionally pure
UI-side DEMO data with no real footage to open, so the worker skips them.
`TEST_CLIP` cameras work exactly like RTSP ones: their `streamUrl` is a local
video file path (or any path OpenCV's `VideoCapture` can open) instead of an
`rtsp://` URL, and the reader loops it back to frame 0 at end-of-file — this
is what the one-day plan's "representative recorded clip" acceptance path
uses when no live camera is available. `TEST_CLIP`/`MOCK_STREAM` never count
as `LIVE` in the dashboard's data-source badge — only a genuinely `ONLINE`
`RTSP`/`HTTP_STREAM`/`WEBCAM` camera does (see `analytics.service.ts`).

## Setup

```
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
```

## Run

```
cd src
..\.venv\Scripts\python.exe main.py
```

Needs the Core API reachable at `CORE_API_URL` and the same
`AI_SERVICE_SHARED_SECRET` the API's `.env` uses.

## Test

```
.venv\Scripts\python.exe -m pytest tests/test_line_crossing.py tests/test_tracker.py -v
```

`smoke_single_camera.py` is not a pytest test — it talks to a live backend and
a live camera, run it manually: `python tests/smoke_single_camera.py <cameraId>`.

## Known limitations

- Without the YOLOX model downloaded (`scripts/prepare_models.py`), detection
  falls back to OpenCV's built-in HOG+SVM detector — noticeably less accurate,
  will miss partial/side-on bodies and can false-positive on bins or mannequins.
- The centroid tracker (counting line only) is intentionally simple
  (nearest-centroid greedy matching, no Kalman filter / re-ID) — adequate for
  a handful of people in frame at low sampling rates, not a crowd-scale tracker.
- `DETECTION_INTERVAL_SEC` trades CPU for responsiveness; too large a value
  can let a fast-moving person cross the line between samples and go uncounted.
- Zone `sensitivity` (LOW/MEDIUM/HIGH) is stored and shown in the owner app but
  not yet read by the detection pipeline — see `zones/zone_loader.py`.
