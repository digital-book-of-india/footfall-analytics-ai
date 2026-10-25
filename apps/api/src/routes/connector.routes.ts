import { Router, Response } from 'express';
import { ConnectorModel } from '../models/Connector.js';
import { ShopModel } from '../models/Shop.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { requireAuth, requireShopAccess, AuthenticatedRequest } from '../middleware/auth.js';
import { generatePairingCode, pairingCodeExpiry } from '../services/connectorManager.js';
import { Connector, ConnectorWithPairingCode, CreateConnectorRequest } from '@dbi/shared-types';

// Mounted at /api/v1/shops -> /:shopId/connectors
export const shopConnectorRouter = Router({ mergeParams: true });
// Mounted at /api/v1/connectors -> /:connectorId, /:connectorId/pairing-code
export const connectorRouter = Router();

function auditConnector(req: AuthenticatedRequest, action: string, connectorId: string, reason?: string) {
  const requestId = (req as any).requestId || 'req_auto';
  return AuditLogModel.create({
    actor: { userId: req.user!._id, email: req.user!.email, role: req.user!.role },
    action,
    target: { type: 'CONNECTOR', id: connectorId },
    reason,
    requestId,
  });
}

/**
 * POST /api/v1/shops/:shopId/connectors
 * Creates a new Connector record in PENDING state and returns its one-time pairing code.
 * Download + run the DBI Footfall Connector exe on the shop's PC, then enter this code.
 */
shopConnectorRouter.post('/:shopId/connectors', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name } = req.body as CreateConnectorRequest;
    if (!name || !name.trim()) {
      sendError(res, 400, 'BAD_REQUEST', 'Connector name is required');
      return;
    }

    const connector = await ConnectorModel.create({
      shopId: req.shop!._id,
      name: name.trim(),
      status: 'PENDING',
      pairingCode: generatePairingCode(),
      pairingCodeExpiresAt: pairingCodeExpiry(),
    });

    await auditConnector(req, 'CREATE_CONNECTOR', connector._id.toString(), `Created connector '${name.trim()}'`);

    const data: ConnectorWithPairingCode = {
      ...connector.toResponseObject(),
      pairingCode: connector.pairingCode!,
      pairingCodeExpiresAt: connector.pairingCodeExpiresAt!.toISOString(),
    };
    sendSuccess<ConnectorWithPairingCode>(res, data, 201);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to create connector');
  }
});

/**
 * GET /api/v1/shops/:shopId/connectors
 */
shopConnectorRouter.get('/:shopId/connectors', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectors = await ConnectorModel.find({ shopId: req.shop!._id }).sort({ createdAt: -1 });
    sendSuccess<Connector[]>(res, connectors.map((c) => c.toResponseObject()));
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to list connectors');
  }
});

async function checkConnectorAccess(req: AuthenticatedRequest, res: Response) {
  const { connectorId } = req.params;
  const connector = await ConnectorModel.findById(connectorId);
  if (!connector) {
    sendError(res, 404, 'NOT_FOUND', `Connector with id '${connectorId}' not found`);
    return null;
  }
  const shop = await ShopModel.findById(connector.shopId);
  if (!shop) {
    sendError(res, 404, 'NOT_FOUND', 'Associated shop not found');
    return null;
  }
  if (req.user!.role !== 'SUPER_ADMIN' && shop.ownerUserId.toString() !== req.user!._id.toString()) {
    sendError(res, 403, 'TENANT_VIOLATION', 'Access denied to this connector');
    return null;
  }
  return connector;
}

/**
 * POST /api/v1/connectors/:connectorId/pairing-code
 * Issues a fresh pairing code (e.g. the old one expired, or the PC needs re-pairing).
 * Invalidates any existing device token.
 */
connectorRouter.post('/:connectorId/pairing-code', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connector = await checkConnectorAccess(req, res);
    if (!connector) return;

    connector.status = 'PENDING';
    connector.pairingCode = generatePairingCode();
    connector.pairingCodeExpiresAt = pairingCodeExpiry();
    connector.tokenHash = null;
    await connector.save();

    await auditConnector(req, 'REISSUE_CONNECTOR_PAIRING_CODE', connector._id.toString());

    const data: ConnectorWithPairingCode = {
      ...connector.toResponseObject(),
      pairingCode: connector.pairingCode!,
      pairingCodeExpiresAt: connector.pairingCodeExpiresAt!.toISOString(),
    };
    sendSuccess<ConnectorWithPairingCode>(res, data);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to reissue pairing code');
  }
});

/**
 * DELETE /api/v1/connectors/:connectorId
 * Revokes the connector's token - it immediately stops being able to heartbeat or list cameras.
 */
connectorRouter.delete('/:connectorId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connector = await checkConnectorAccess(req, res);
    if (!connector) return;

    connector.status = 'REVOKED';
    connector.tokenHash = null;
    connector.pairingCode = null;
    connector.pairingCodeExpiresAt = null;
    await connector.save();

    await auditConnector(req, 'REVOKE_CONNECTOR', connector._id.toString());

    sendSuccess(res, { id: connector._id.toString(), message: 'Connector revoked' });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to revoke connector');
  }
});
