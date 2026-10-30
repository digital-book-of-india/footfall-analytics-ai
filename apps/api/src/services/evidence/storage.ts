import fs from 'fs';
import path from 'path';
import { config } from '../../config.js';

const ROOT = path.resolve(config.evidenceStorageDir);

/** Rejects any objectKey that would resolve outside the evidence storage root (path traversal). */
export function safeResolve(objectKey: string): string | null {
  if (typeof objectKey !== 'string' || !objectKey || objectKey.includes('\0')) return null;
  const resolved = path.resolve(ROOT, objectKey);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

export async function writeEvidenceFile(objectKey: string, buffer: Buffer): Promise<boolean> {
  const dest = safeResolve(objectKey);
  if (!dest) return false;
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.writeFile(dest, buffer);
  return true;
}

export function removeEvidenceFile(objectKey: string | undefined): void {
  if (!objectKey) return;
  const target = safeResolve(objectKey);
  if (!target) return;
  fs.promises.unlink(target).catch(() => {
    // already gone / never written — nothing to clean up
  });
}

/** Removes both the snapshot and clip files (if any) referenced by a SecurityEvent's evidence sub-document. */
export function removeEvidenceOf(evidence: { snapshotObjectKey?: string; clipObjectKey?: string } | undefined): void {
  if (!evidence) return;
  removeEvidenceFile(evidence.snapshotObjectKey);
  removeEvidenceFile(evidence.clipObjectKey);
}

export { ROOT as EVIDENCE_STORAGE_ROOT };
