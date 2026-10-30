import jwt from 'jsonwebtoken';
import { config } from '../../config.js';

export type EvidenceKind = 'snapshot' | 'clip';

interface EvidenceTokenPayload {
  eventId: string;
  kind: EvidenceKind;
}

/**
 * Evidence images are never served from a stable, guessable URL: the owner app gets a link
 * signed for one (eventId, kind) pair that expires quickly, so a leaked link stops working on
 * its own instead of staying valid forever.
 */
export function signEvidenceUrl(eventId: string, kind: EvidenceKind): { url: string; expiresAt: string } {
  const token = jwt.sign({ eventId, kind } as EvidenceTokenPayload, config.jwtSecret, {
    expiresIn: config.evidenceUrlTtlSeconds,
  });
  const expiresAt = new Date(Date.now() + config.evidenceUrlTtlSeconds * 1000).toISOString();
  return { url: `/api/v1/evidence/${eventId}/${kind}?token=${token}`, expiresAt };
}

export function verifyEvidenceToken(token: string): EvidenceTokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as EvidenceTokenPayload;
  } catch {
    return null;
  }
}
