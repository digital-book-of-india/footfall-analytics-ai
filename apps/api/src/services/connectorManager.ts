import crypto from 'crypto';

/**
 * Pairing/token helpers for the on-site Connector agent — ported from the sibling
 * theaft-ai project's services/connectors/manager.ts (generic auth plumbing, no
 * theft-specific logic).
 */

// Pairing codes are short-lived and human-typed, so they're deliberately low-entropy
// (XXXX-XXXX from an unambiguous alphabet) - the connector token below is the real secret.
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const PAIRING_CODE_TTL_MINUTES = parseInt(process.env.CONNECTOR_PAIRING_CODE_TTL_MINUTES || '15', 10);

export function generatePairingCode(): string {
  const chars = Array.from({ length: 8 }, () => {
    const idx = crypto.randomInt(0, PAIRING_CODE_ALPHABET.length);
    return PAIRING_CODE_ALPHABET[idx];
  });
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function pairingCodeExpiry(): Date {
  return new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60 * 1000);
}

// The connector token itself is a 256-bit random secret, shown to the operator exactly
// once (inside the pairing exchange response). Only its SHA-256 hash is stored, so a
// stolen database dump can't be used to impersonate a connector.
export function generateConnectorToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashConnectorToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** A paired connector counts as online only if it heartbeat within the stale window — never fake "online". */
export const CONNECTOR_STALE_MS = 2 * 60 * 1000;

export function isConnectorOnline(connector: { status: string; lastHeartbeatAt?: Date | string | null }): boolean {
  if (connector.status !== 'PAIRED' || !connector.lastHeartbeatAt) return false;
  return Date.now() - new Date(connector.lastHeartbeatAt).getTime() <= CONNECTOR_STALE_MS;
}
