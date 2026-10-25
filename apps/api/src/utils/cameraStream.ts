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
