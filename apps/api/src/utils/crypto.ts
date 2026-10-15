import crypto from 'crypto';
import { config } from '../config.js';

// Derive a fixed 32-byte key from the configured secret
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getDerivedKey(): Buffer {
  return crypto.createHash('sha256').update(config.cameraEncryptionKey).digest();
}

/**
 * Encrypts plain text string using AES-256-GCM.
 * Output format: "iv:authTag:ciphertext" in hex.
 */
export function encryptCredential(plainText: string): string {
  if (!plainText) return '';
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted string.
 */
export function decryptCredential(cipherPayload: string): string {
  if (!cipherPayload) return '';
  const parts = cipherPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Strips user:pass from any RTSP or HTTP URL for safe display and logging.
 * Example: "rtsp://admin:secret123@192.168.1.50:554/stream" -> "rtsp://192.168.1.50:554/stream"
 */
export function sanitizeStreamUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    // If not standard URL format (e.g. test clip name), remove inline credentials via regex
    return url.replace(/\/\/([^:]+):([^@]+)@/, '//');
  }
}
