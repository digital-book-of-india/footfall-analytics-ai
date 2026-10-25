import { Router, Request, Response } from 'express';
import { ConnectorModel } from '../models/Connector.js';
import { ShopModel } from '../models/Shop.js';
import { CameraModel } from '../models/Camera.js';
import { connectorAuth, ConnectorAuthedRequest } from '../middleware/connectorAuth.js';
import { generateConnectorToken, hashConnectorToken } from '../services/connectorManager.js';
import { resolveDecryptedStreamUrl } from '../utils/cameraStream.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { PairConnectorRequest, PairConnectorResponseData, ConnectorHeartbeatRequest, ConnectorCameraListItem } from '@dbi/shared-types';

/** 20 attempts/min per IP — pairing codes are unauthenticated and guessable in bulk otherwise. */
const pairingRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Too many pairing attempts. Please try again in a minute.',
});

// Mounted at /internal/v1/connectors with NO auth - this is how an unpaired Connector exe
// first proves it holds a valid, unexpired pairing code generated in the owner panel.
export const connectorPairingRouter = Router();

connectorPairingRouter.post('/pair', pairingRateLimiter, async (req: Request, res: Response) => {
  try {
    const { pairingCode } = req.body as PairConnectorRequest;
    if (!pairingCode || typeof pairingCode !== 'string') {
      sendError(res, 400, 'BAD_REQUEST', 'pairingCode is required');
      return;
    }

    const normalizedCode = pairingCode.trim().toUpperCase();
    const connector = await ConnectorModel.findOne({ pairingCode: normalizedCode, status: 'PENDING' });

    if (!connector || !connector.pairingCodeExpiresAt || connector.pairingCodeExpiresAt < new Date()) {
      sendError(res, 400, 'BAD_REQUEST', 'This pairing code is invalid or has expired. Generate a new one in the owner panel.');
      return;
    }

    const shop = await ShopModel.findById(connector.shopId).select('name');

    const connectorToken = generateConnectorToken();
    connector.tokenHash = hashConnectorToken(connectorToken);
    connector.status = 'PAIRED';
    connector.pairingCode = null;
    connector.pairingCodeExpiresAt = null;
    connector.lastHeartbeatAt = new Date();
    await connector.save();

    sendSuccess<PairConnectorResponseData>(res, {
      connectorId: connector._id.toString(),
      connectorToken,
      shopId: connector.shopId.toString(),
      shopName: shop?.name || '',
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Pairing failed');
  }
});

// Mounted at /internal/v1/connectors behind connectorAuth - everything a paired Connector
// calls for the rest of its life (heartbeat, camera sync).
export const connectorDeviceRouter = Router();
connectorDeviceRouter.use(connectorAuth);

connectorDeviceRouter.post('/heartbeat', async (req: ConnectorAuthedRequest, res: Response) => {
  try {
    const { version, activeCameraCount } = req.body as ConnectorHeartbeatRequest;
    await ConnectorModel.findByIdAndUpdate(req.connector!.id, {
      lastHeartbeatAt: new Date(),
      lastSeenVersion: version || null,
      ...(activeCameraCount !== undefined ? { activeCameraCount } : {}),
    });
    sendSuccess(res, { status: 'OK' });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to record heartbeat');
  }
});

// GET /internal/v1/connectors/cameras
// The only place a Connector gets decrypted stream URLs - scoped to just its own cameras.
connectorDeviceRouter.get('/cameras', async (req: ConnectorAuthedRequest, res: Response) => {
  try {
    const cameras = await CameraModel.find({ connectorId: req.connector!.id });

    const items: ConnectorCameraListItem[] = cameras.map((cam) => ({
      cameraId: cam._id.toString(),
      shopId: cam.shopId.toString(),
      name: cam.name,
      connectionType: cam.connectionType,
      streamUrl: resolveDecryptedStreamUrl(cam),
    }));

    sendSuccess(res, { items });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to list connector cameras');
  }
});
