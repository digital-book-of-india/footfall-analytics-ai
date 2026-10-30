"""Tells a person who walked into the picture from something that was always there.

A poster, a board or a mannequin looks like a person to a detector but never *arrives*: it is
already part of the empty scene. This keeps a slowly updated picture of that empty scene and asks,
for a detected person, how much of their box differs from it. A real newcomer differs a lot; a
poster does not.

The picture is not updated while someone stands in the zone, so a person who stays for minutes is
not absorbed into it. If the whole frame changes at once (lights on/off, day/IR switch) it starts over.

Ported from the sibling theaft-ai project (apps/ai-worker/src/detection/background.py).
"""

import os
import time
from typing import List, Optional, Tuple

import cv2
import numpy as np

SCALE_WIDTH = 160  # work on a small, blurred grey picture: cheap, and ignores noise
DIFF_THRESHOLD = float(os.environ.get("BG_DIFF_THRESHOLD", "25"))  # grey levels that count as "different"
MIN_FOREGROUND = float(os.environ.get("BG_MIN_FOREGROUND", "0.2"))  # share of the person's box that must differ
LIGHT_CHANGE_SHARE = 0.6  # this much of the frame changing at once is a lighting change, not a person
LEARNING_RATE = 0.05
WARMUP_UPDATES = 5  # no judgement until the empty scene has been seen a few times
FREEZE_SECONDS = 15.0  # keep the empty-scene picture as is this long after a person was in the zone

Box = Tuple[int, int, int, int]


class BackgroundModel:
    def __init__(self):
        self._bg: Optional[np.ndarray] = None
        self._updates = 0
        self._frozen_until = 0.0

    @staticmethod
    def _prep(frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        small = cv2.resize(frame, (SCALE_WIDTH, max(1, int(h * SCALE_WIDTH / w))), interpolation=cv2.INTER_AREA)
        grey = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        return cv2.GaussianBlur(grey, (5, 5), 0).astype(np.float32)

    def _restart(self, cur: np.ndarray) -> None:
        self._bg = cur
        self._updates = 1

    def update(self, frame: np.ndarray, person_boxes: List[Box], person_in_zone: bool) -> None:
        """Call once per detection cycle with every person box found in the frame."""
        cur = self._prep(frame)
        if self._bg is None or self._bg.shape != cur.shape:
            self._restart(cur)
            return
        if float((np.abs(cur - self._bg) > DIFF_THRESHOLD).mean()) > LIGHT_CHANGE_SHARE:
            self._restart(cur)
            return

        now = time.time()
        if person_in_zone:
            self._frozen_until = now + FREEZE_SECONDS
        if now < self._frozen_until:
            return

        weight = np.full(cur.shape, LEARNING_RATE, dtype=np.float32)
        sx, sy = cur.shape[1] / frame.shape[1], cur.shape[0] / frame.shape[0]
        for x, y, w, h in person_boxes:  # people are not part of the empty scene
            x0, y0 = max(0, int((x - w * 0.1) * sx)), max(0, int((y - h * 0.1) * sy))
            x1, y1 = int((x + w * 1.1) * sx) + 1, int((y + h * 1.1) * sy) + 1
            weight[y0:y1, x0:x1] = 0.0
        self._bg += weight * (cur - self._bg)
        self._updates += 1

    def is_new_object(self, frame: np.ndarray, bbox: Box) -> bool:
        """True if the box differs enough from the empty scene to be someone who arrived.
        False while the empty scene is still being learnt (no alerts in the first few seconds)."""
        if self._bg is None or self._updates < WARMUP_UPDATES:
            return False
        cur = self._prep(frame)
        if cur.shape != self._bg.shape:
            return False
        x, y, w, h = bbox
        sx, sy = cur.shape[1] / frame.shape[1], cur.shape[0] / frame.shape[0]
        x0, y0 = max(0, int(x * sx)), max(0, int(y * sy))
        x1, y1 = min(cur.shape[1], int((x + w) * sx) + 1), min(cur.shape[0], int((y + h) * sy) + 1)
        if x1 <= x0 or y1 <= y0:
            return False
        region = np.abs(cur[y0:y1, x0:x1] - self._bg[y0:y1, x0:x1]) > DIFF_THRESHOLD
        return float(region.mean()) >= MIN_FOREGROUND
