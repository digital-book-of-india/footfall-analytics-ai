"""Opens an RTSP/file/webcam video source and yields frames, reconnecting on failure."""

import time
from typing import Iterator, Optional

import cv2
import numpy as np


class StreamReader:
    MAX_OPEN_BACKOFF_SECONDS = 60.0

    def __init__(self, stream_url: str, reconnect_delay: float = 5.0, connect_timeout_ms: int = 5000):
        self.stream_url = stream_url
        self.reconnect_delay = reconnect_delay
        self.connect_timeout_ms = connect_timeout_ms
        self._cap: Optional[cv2.VideoCapture] = None
        self.last_frame_at: Optional[float] = None
        self._open_failures = 0

    def _open_backoff(self) -> float:
        # Some cameras (Hikvision in particular) lock out a client that keeps failing to
        # open; back off instead of hammering retries, which only makes the lockout worse.
        delay = self.reconnect_delay * (2 ** max(0, self._open_failures - 1))
        return min(delay, self.MAX_OPEN_BACKOFF_SECONDS)

    def _open(self) -> bool:
        cap = cv2.VideoCapture(self.stream_url)
        try:
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, self.connect_timeout_ms)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, self.connect_timeout_ms)
        except Exception:
            pass  # not every OpenCV build supports these flags
        if not cap.isOpened():
            cap.release()
            return False
        self._cap = cap
        return True

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def frames(self, stop_flag, on_fail=None) -> Iterator[np.ndarray]:
        """Yields frames until stop_flag() returns True. Reconnects automatically on drop.

        For a looping local test clip (TEST_CLIP connectionType), rewinds to frame 0
        on end-of-file instead of treating EOF as a dropped connection.
        """
        is_local_file = not self.stream_url.lower().startswith(('rtsp://', 'http://', 'https://'))

        while not stop_flag():
            if self._cap is None:
                if self._open():
                    self._open_failures = 0
                else:
                    self._open_failures += 1
                    if on_fail:
                        on_fail()
                    time.sleep(self._open_backoff())
                    continue

            ok, frame = self._cap.read()  # type: ignore[union-attr]
            if not ok or frame is None:
                if is_local_file:
                    self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # type: ignore[union-attr]
                    continue
                self.close()
                if on_fail:
                    on_fail()
                time.sleep(self.reconnect_delay)
                continue

            self.last_frame_at = time.time()
            yield frame
