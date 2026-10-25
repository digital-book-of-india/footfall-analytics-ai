import { Request, Response, NextFunction } from 'express';
import { ConnectorModel } from '../models/Connector.js';
import { hashConnectorToken } from '../services/connectorManager.js';
import { sendError } from '../utils/response.js';

export interface ConnectorAuthedRequest extends Request {
  connector?: { id: string; shopId: string };
}

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
    next();
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Connector authentication error');
  }
}
