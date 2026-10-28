import { ICameraDocument } from '../models/Camera.js';
import { decryptCredential } from './crypto.js';

/**
 * Decrypts a camera's stored stream URL and, if separate username/password
 * credentials were saved and the URL itself has none embedded, merges them in.
 * Shared by the internal AI-worker stream-config endpoint and the real camera
 * connectivity test — both need the actual connectable URL, decrypted once the
 * same way.
 */
export function resolveDecryptedStreamUrl(camera: ICameraDocument): string {
  let streamUrl = decryptCredential(camera.encryptedStreamUrl);

  if (camera.encryptedCredentials) {
    try {
      const { username, password } = JSON.parse(decryptCredential(camera.encryptedCredentials));
      if (username && password && !streamUrl.includes('@')) {
        const parsed = new URL(streamUrl);
        parsed.username = encodeURIComponent(username);
        parsed.password = encodeURIComponent(password);
        streamUrl = parsed.toString();
      }
    } catch {
      // Non-fatal: fall back to the stream URL as stored (e.g. TEST_CLIP local path, no URL-style creds)
    }
  }

  return streamUrl;
}

/**
 * Like resolveDecryptedStreamUrl, but returns null instead of throwing when this one
 * camera's stored URL cannot be decrypted (e.g. it was saved under a different
 * CAMERA_SECRET_ENCRYPTION_KEY). Lists that serve many cameras at once use this so a single
 * bad camera is skipped and flagged rather than turning the whole response into a 500.
 */
export function tryResolveDecryptedStreamUrl(camera: ICameraDocument): string | null {
  try {
    return resolveDecryptedStreamUrl(camera);
  } catch {
    console.warn(`[cameras] stream URL for camera ${camera._id} could not be decrypted - skipping it`);
    return null;
  }
}
