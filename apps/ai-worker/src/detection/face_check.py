"""Tells whether a detected person is facing the camera.

An alert is only wanted for someone with their back to the camera (face towards the shutter), not
for a customer standing and looking at the camera. YuNet (MIT licence, ~230 KB) looks for a face in
the head area of the person's box. Set YUNET_MODEL_PATH to use another location than the default
(see detection/models/README or prepare_models.py). Without the model nothing can be said, so the
check returns None and callers must not suppress anything.

Ported from the sibling theaft-ai project (apps/ai-worker/src/detection/face_check.py).
"""

import os
import threading
from typing import Optional, Tuple

import cv2
import numpy as np

MODEL_PATH = os.environ.get(
    "YUNET_MODEL_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "face_detection_yunet_2023mar.onnx"),
)
FACE_SCORE = float(os.environ.get("FACE_SCORE_THRESHOLD", "0.6"))
HEAD_SHARE = 0.45  # the top part of the person's box is searched for a face
UPSCALE = 2  # small heads are enlarged first; faces are hard to find below ~20 px


class FaceChecker:
    def __init__(self):
        self._detector = None
        self._lock = threading.Lock()  # one detector is shared by every camera's thread
        if not os.path.exists(MODEL_PATH):
            print(f"[face] {MODEL_PATH} not found - cannot tell whether people face the camera")
            return
        try:
            self._detector = cv2.FaceDetectorYN.create(MODEL_PATH, "", (320, 320), FACE_SCORE, 0.3, 5)
        except Exception as e:  # noqa: BLE001 - alerts keep working without the face check
            print(f"[face] could not load {MODEL_PATH}: {e}")

    @property
    def available(self) -> bool:
        return self._detector is not None

    def face_visible(self, frame: np.ndarray, bbox: Tuple[int, int, int, int]) -> Optional[bool]:
        """True if a face is seen, False if not, None when the check is not available."""
        if self._detector is None:
            return None
        x, y, w, h = bbox
        head = frame[max(0, y): max(0, y) + max(1, int(h * HEAD_SHARE)), max(0, x): max(0, x) + max(1, w)]
        if head.size == 0:
            return None
        head = cv2.resize(head, None, fx=UPSCALE, fy=UPSCALE, interpolation=cv2.INTER_LINEAR)
        try:
            with self._lock:
                self._detector.setInputSize((head.shape[1], head.shape[0]))
                _, faces = self._detector.detect(head)
        except Exception as e:  # noqa: BLE001
            print(f"[face] check failed: {e}")
            return None
        return faces is not None and len(faces) > 0
