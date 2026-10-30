"""Turns raw per-frame zone detections into a conservative, deduplicated security event decision.

Kept intentionally simple (time-in-zone + cooldown) rather than pose/hand models. Ported from the
sibling theaft-ai project (apps/ai-worker/src/heuristics/classifier.py).
"""

import math
import os
import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

# Someone walking past never counts: they have to stay put (feet within STILL_MAX_MOVE of where they
# stopped, as a share of the picture) for this long. 5s raises "person in zone", 10s "shutter interaction".
PERSON_STILL_SECONDS = float(os.environ.get("PERSON_STILL_SECONDS", "5"))
SHUTTER_INTERACTION_SECONDS = float(os.environ.get("SHUTTER_INTERACTION_SECONDS", "10"))
STILL_MAX_MOVE = float(os.environ.get("STILL_MAX_MOVE", "0.07"))
# While the same person keeps standing there, remind the owner every 5 minutes (not every minute).
EVENT_COOLDOWN_SECONDS = float(os.environ.get("EVENT_COOLDOWN_SECONDS", "300"))
# The detector drops a person for a frame or two now and then. Only treat them as having left
# the zone after this long without a detection, or each flicker would start a new "visit".
ABSENCE_GRACE_SECONDS = float(os.environ.get("ABSENCE_GRACE_SECONDS", "5"))
# A person has to be seen in the zone this many times during one visit before anything is raised,
# so a single wrong frame can never become an alert.
MIN_DETECTIONS_TO_ALERT = int(os.environ.get("MIN_DETECTIONS_TO_ALERT", "3"))


# Higher number = more severe. An escalation to a higher severity is never held back by
# cooldown — only repeats of the *same or lower* severity are throttled.
_SEVERITY = {"PERSON_IN_ZONE": 1, "POSSIBLE_SHUTTER_INTERACTION": 2}


@dataclass
class ZoneState:
    entered_at: Optional[float] = None
    last_event_at: Optional[float] = None
    last_severity: int = 0
    last_in_zone_at: Optional[float] = None
    detections: int = 0  # times seen in the zone during the current visit
    anchor: Optional[Tuple[float, float]] = None  # where the person stopped
    still_since: Optional[float] = None


class EventClassifier:
    """One instance per camera. Call update(in_zone, confidence) every detection cycle."""

    def __init__(self):
        self._state: Dict[str, ZoneState] = {}

    def update(
        self, camera_id: str, in_zone: bool, confidence: float, pos: Optional[Tuple[float, float]] = None
    ) -> Optional[dict]:
        now = time.time()
        state = self._state.setdefault(camera_id, ZoneState())

        if not in_zone:
            gone_for = now - state.last_in_zone_at if state.last_in_zone_at is not None else None
            if gone_for is not None and gone_for >= ABSENCE_GRACE_SECONDS:
                state.entered_at = None
                state.detections = 0
                state.anchor = None
                state.still_since = None
            return None

        state.last_in_zone_at = now
        if state.entered_at is None:
            state.entered_at = now
            state.detections = 0
            # A fresh visit only starts over once the cooldown is up; coming back sooner stays throttled.
            if state.last_event_at is None or now - state.last_event_at >= EVENT_COOLDOWN_SECONDS:
                state.last_severity = 0

        # Moving about does not count: starting to move again restarts the "standing still" clock.
        if pos is not None:
            if state.anchor is None or math.hypot(pos[0] - state.anchor[0], pos[1] - state.anchor[1]) > STILL_MAX_MOVE:
                state.anchor = pos
                state.still_since = now
                state.detections = 0
        elif state.still_since is None:
            state.still_since = now

        state.detections += 1
        if state.detections < MIN_DETECTIONS_TO_ALERT:
            return None

        dwell = now - (state.still_since if state.still_since is not None else state.entered_at)

        if dwell >= SHUTTER_INTERACTION_SECONDS:
            event_type = "POSSIBLE_SHUTTER_INTERACTION"
            event_confidence = min(1.0, confidence + 0.1)
        elif dwell >= PERSON_STILL_SECONDS:
            event_type = "PERSON_IN_ZONE"
            event_confidence = confidence
        else:
            return None

        severity = _SEVERITY[event_type]
        is_escalation = severity > state.last_severity
        cooldown_elapsed = state.last_event_at is None or (now - state.last_event_at) >= EVENT_COOLDOWN_SECONDS

        if not is_escalation and not cooldown_elapsed:
            return None  # same-or-lower severity, still cooling down: don't re-fire

        state.last_event_at = now
        state.last_severity = severity
        return {"eventType": event_type, "confidence": round(event_confidence, 2), "dwellSeconds": round(dwell, 1)}
