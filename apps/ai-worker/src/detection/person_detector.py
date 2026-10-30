"""Person detection.

Uses YOLOX-tiny (Apache-2.0) through OpenCV's DNN module when its ONNX file is present - far more
reliable than the HOG+SVM detector this worker started with, which mistook bins/posters for
people and missed anyone not standing upright and facing the camera. Run
`python scripts/prepare_models.py` (or set YOLOX_MODEL_PATH) to fetch/place the model; without it
the OpenCV HOG + SVM people detector is used instead, so the worker still runs, just less
accurately. Ported from the sibling theaft-ai project's detection/person_detector.py and merged
with this project's own `Detection.centroid` (needed by geometry/line_crossing.py's counting-line
logic, which theaft-ai's zone-only detector never had to provide).

Both backends keep the same detect(frame) -> list[Detection] shape.
"""

import os
import threading
from dataclasses import dataclass
from typing import List, Tuple

import cv2
import numpy as np

MAX_DETECTION_WIDTH = 640  # HOG only: downscale for speed; upscale boxes back afterwards

MODEL_PATH = os.environ.get(
    "YOLOX_MODEL_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "yolox_tiny.onnx"),
)
INPUT_SIZE = 416
SCORE_THRESHOLD = float(os.environ.get("YOLOX_SCORE_THRESHOLD", "0.35"))  # below this is not even reported
NMS_THRESHOLD = 0.45
PERSON_CLASS = 0  # COCO class 0


@dataclass
class Detection:
    bbox: Tuple[int, int, int, int]  # x, y, w, h in ORIGINAL frame coordinates
    confidence: float  # heuristically normalized to roughly 0..1

    @property
    def centroid(self) -> Tuple[float, float]:
        x, y, w, h = self.bbox
        return (x + w / 2.0, y + h / 2.0)


class PersonDetector:
    def __init__(self):
        self.name = "hog-crossing-v1.0"
        self._net = None
        self._lock = threading.Lock()  # one network is shared by every camera's thread
        self._grids, self._strides = self._make_grids()

        if os.path.exists(MODEL_PATH):
            try:
                self._net = cv2.dnn.readNetFromONNX(MODEL_PATH)
                self.name = "yolox-tiny-v1.0"
            except Exception as e:  # noqa: BLE001 - fall back rather than stop watching cameras
                print(f"[detector] could not load {MODEL_PATH}: {e}")
        else:
            print(f"[detector] {MODEL_PATH} not found - using the less accurate HOG detector")

        if self._net is None:
            self.hog = cv2.HOGDescriptor()
            self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        print(f"[detector] using {self.name}")

    # ---- YOLOX ----

    @staticmethod
    def _make_grids():
        grids, strides = [], []
        for stride in (8, 16, 32):
            n = INPUT_SIZE // stride
            xv, yv = np.meshgrid(np.arange(n), np.arange(n))
            g = np.stack((xv, yv), 2).reshape(-1, 2)
            grids.append(g)
            strides.append(np.full((g.shape[0], 1), stride))
        return np.concatenate(grids, 0).astype(np.float32), np.concatenate(strides, 0).astype(np.float32)

    def _detect_yolox(self, frame: np.ndarray) -> List[Detection]:
        h, w = frame.shape[:2]
        ratio = min(INPUT_SIZE / h, INPUT_SIZE / w)
        rw, rh = int(w * ratio), int(h * ratio)
        canvas = np.full((INPUT_SIZE, INPUT_SIZE, 3), 114, dtype=np.uint8)  # YOLOX's letterbox grey
        canvas[:rh, :rw] = cv2.resize(frame, (rw, rh), interpolation=cv2.INTER_LINEAR)
        blob = canvas.astype(np.float32).transpose(2, 0, 1)[None]  # BGR, 0..255, as YOLOX expects

        with self._lock:
            self._net.setInput(blob)
            out = self._net.forward()[0]  # (3549, 85): box, objectness, 80 class scores (undecoded)

        xy = (out[:, :2] + self._grids) * self._strides
        wh = np.exp(out[:, 2:4]) * self._strides
        scores = out[:, 4] * out[:, 5 + PERSON_CLASS]
        keep = scores >= SCORE_THRESHOLD
        if not keep.any():
            return []

        xy, wh, scores = xy[keep], wh[keep], scores[keep]
        boxes = np.concatenate([xy - wh / 2, wh], axis=1) / ratio  # x, y, w, h in the original frame
        idx = cv2.dnn.NMSBoxes(boxes.tolist(), scores.tolist(), SCORE_THRESHOLD, NMS_THRESHOLD)

        results: List[Detection] = []
        for i in np.array(idx).reshape(-1):
            x, y, bw, bh = boxes[i]
            x0, y0 = max(0, int(x)), max(0, int(y))
            x1, y1 = min(w, int(x + bw)), min(h, int(y + bh))
            if x1 > x0 and y1 > y0:
                results.append(Detection(bbox=(x0, y0, x1 - x0, y1 - y0), confidence=float(min(1.0, scores[i]))))
        return results

    # ---- HOG fallback ----

    def _detect_hog(self, frame: np.ndarray) -> List[Detection]:
        h, w = frame.shape[:2]
        scale = min(1.0, MAX_DETECTION_WIDTH / w) if w > MAX_DETECTION_WIDTH else 1.0
        small = cv2.resize(frame, (int(w * scale), int(h * scale))) if scale != 1.0 else frame

        rects, weights = self.hog.detectMultiScale(
            small, winStride=(8, 8), padding=(8, 8), scale=1.05
        )

        results: List[Detection] = []
        for (x, y, bw, bh), weight in zip(rects, weights):
            # HOG's SVM decision score is unbounded (~0 to 2+ for solid detections);
            # clip into a rough 0..1 confidence band rather than treat it as a probability.
            confidence = float(min(1.0, max(0.0, (weight - 0.3) / 1.3)))
            if scale != 1.0:
                x, y, bw, bh = (int(x / scale), int(y / scale), int(bw / scale), int(bh / scale))
            results.append(Detection(bbox=(x, y, bw, bh), confidence=confidence))
        return results

    def detect(self, frame: np.ndarray) -> List[Detection]:
        return self._detect_yolox(frame) if self._net is not None else self._detect_hog(frame)
