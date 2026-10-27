/**
 * In-memory "live view" store — ported from the sibling theaft-ai project's
 * services/connectors/live.ts. Lets the owner app ask a camera's Connector/AI-worker to
 * push JPEG frames while someone is actually watching, and polls them back as a cheap
 * picture-fallback when WebRTC isn't available. Never persisted — a restart just means
 * "no picture yet", not a crash.
 */

const LIVE_WINDOW_MS = 30 * 1000;

const liveUntil = new Map<string, number>();
const frames = new Map<string, { jpeg: Buffer; at: number }>();

/** Marks a camera as "being watched" for the next 30s (the owner app re-calls this to keep it alive). */
export function requestLive(cameraId: string): void {
  liveUntil.set(cameraId, Date.now() + LIVE_WINDOW_MS);
}

/** Filters to camera ids whose watch-window hasn't expired yet, lazily evicting expired ones. */
export function wantedLive(cameraIds: string[]): string[] {
  const now = Date.now();
  const wanted: string[] = [];
  for (const id of cameraIds) {
    const until = liveUntil.get(id);
    if (until === undefined) continue;
    if (until <= now) {
      liveUntil.delete(id);
      continue;
    }
    wanted.push(id);
  }
  return wanted;
}

export function storeFrame(cameraId: string, jpeg: Buffer): void {
  frames.set(cameraId, { jpeg, at: Date.now() });
}

export function getFrame(cameraId: string): { jpeg: Buffer; at: number } | null {
  return frames.get(cameraId) || null;
}

export function dropFrame(cameraId: string): void {
  frames.delete(cameraId);
}
