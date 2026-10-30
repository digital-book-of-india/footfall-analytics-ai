"""Downloads the ONNX models detection/person_detector.py and detection/face_check.py use.

Run once per machine (or whenever detection/models/ is empty):

    python scripts/prepare_models.py

Without these, person_detector.py silently falls back to the much less accurate OpenCV
HOG+SVM detector, and face_check.py's face-facing-camera suppression is skipped entirely.
Same models/pins the connector's packaged build downloads (apps/connector/scripts/prepare-python.js).
"""

import hashlib
import os
import sys
import urllib.request

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "detection", "models")

# (filename, url, sha256)
MODELS = [
    (
        "yolox_tiny.onnx",
        "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_tiny.onnx",
        "427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7",
    ),
    (
        "face_detection_yunet_2023mar.onnx",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
]


def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)
    failures = []

    for filename, url, expected_sha256 in MODELS:
        dest = os.path.join(MODELS_DIR, filename)
        if os.path.exists(dest) and sha256_of(dest) == expected_sha256:
            print(f"[prepare_models] {filename} already present, skipping")
            continue

        print(f"[prepare_models] downloading {filename}...")
        try:
            urllib.request.urlretrieve(url, dest)
        except Exception as e:  # noqa: BLE001
            print(f"[prepare_models] FAILED to download {filename}: {e}")
            failures.append(filename)
            continue

        actual = sha256_of(dest)
        if actual != expected_sha256:
            os.remove(dest)
            print(f"[prepare_models] {filename} checksum mismatch (expected {expected_sha256}, got {actual})")
            failures.append(filename)
            continue

        print(f"[prepare_models] {filename} ready")

    if failures:
        print(f"[prepare_models] failed: {', '.join(failures)} — detection falls back to HOG without them")
        sys.exit(1)
    print("[prepare_models] all models ready")


if __name__ == "__main__":
    main()
