import { Request, Response, NextFunction } from 'express';
import { ConnectorModel } from '../models/Connector.js';
import { hashConnectorToken } from '../services/connectorManager.js';
import { sendError } from '../utils/response.js';

export interface ConnectorAuthedRequest extends Request {
  connector?: { id: string; shopId: string };
}

// A connector that only updates lastHeartbeatAt on its explicit POST /heartbeat (every
// 20-45s) can look "offline" between beats even while it's busy polling /jobs every few
// seconds. Throttling to once per 10s per connector keeps every authenticated request
// counting as a sign of life without hammering the DB on each /jobs poll.
const TOUCH_EVERY_MS = 10_000;
const lastTouch = new Map<string, number>();

/**
 * Per-connector auth: unlike requireAiServiceSecret (one shared secret for the whole
 * cloud AI worker), every paired Connector has its own secret. The raw token only ever
 * exists on the connector's own machine and in the one-time pairing response; the DB
 * holds just its SHA-256 hash.
 */
export async function connectorAuth(req: ConnectorAuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const tokenHeader = req.headers['x-connector-token'];
  const authHeader = req.headers.authorization;

  let token: string | undefined;
  if (typeof tokenHeader === 'string') {
    token = tokenHeader;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token) {
    sendError(res, 401, 'UNAUTHORIZED', 'Missing connector token');
    return;
  }

  try {
    const connector = await ConnectorModel.findOne({
      tokenHash: hashConnectorToken(token),
      status: 'PAIRED',
    });

    if (!connector) {
      sendError(res, 401, 'UNAUTHORIZED', 'Invalid or revoked connector token');
      return;
    }

    req.connector = { id: connector._id.toString(), shopId: connector.shopId.toString() };

    const now = Date.now();
    const last = lastTouch.get(req.connector.id) || 0;
    if (now - last > TOUCH_EVERY_MS) {
      lastTouch.set(req.connector.id, now);
      // Fire-and-forget: a slow/failed touch must never fail the request it's riding on.
      ConnectorModel.findByIdAndUpdate(req.connector.id, { lastHeartbeatAt: new Date() }).catch(() => {});
    }

    next();
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Connector authentication error');
  }
}
