import express, { Router, Request, Response } from 'express';
import { ConnectorModel } from '../models/Connector.js';
import { ShopModel } from '../models/Shop.js';
import { CameraModel } from '../models/Camera.js';
import { CountingLineModel } from '../models/CountingLine.js';
import { connectorAuth, ConnectorAuthedRequest } from '../middleware/connectorAuth.js';
import { generateConnectorToken, hashConnectorToken } from '../services/connectorManager.js';
import { tryResolveDecryptedStreamUrl } from '../utils/cameraStream.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { takePendingJobs, completeJob } from '../services/connectorJobs.js';
import { wantedLive, storeFrame } from '../services/connectorLive.js';
import { ingestFootfallEvents, parseIngestEventsBody, recordCameraHealth } from './internal.routes.js';
import { PairConnectorRequest, PairConnectorResponseData, ConnectorHeartbeatRequest, ConnectorCameraListItem, AIHeartbeatRequest, IngestEventResponseData } from '@dbi/shared-types';

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

    // A camera whose URL can't be decrypted is skipped (not a 500 for the whole list).
    const items: ConnectorCameraListItem[] = [];
    for (const cam of cameras) {
      const streamUrl = tryResolveDecryptedStreamUrl(cam);
      if (streamUrl === null) continue;
      items.push({
        cameraId: cam._id.toString(),
        shopId: cam.shopId.toString(),
        name: cam.name,
        connectionType: cam.connectionType,
        streamUrl,
      });
    }

    sendSuccess(res, { items });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to list connector cameras');
  }
});

// GET /internal/v1/connectors/jobs
// Polled every few seconds by the Connector's job runner (PROBE/DISCOVER/WEBRTC).
// Hands each pending job out exactly once - a crashed connector just lets it expire.
connectorDeviceRouter.get('/jobs', async (req: ConnectorAuthedRequest, res: Response) => {
  try {
    const jobs = takePendingJobs(req.connector!.id).map((job) => ({
      id: job.id,
      type: job.type,
      cameraId: job.cameraId,
      streamUrl: job.streamUrl,
      payload: job.payload,
    }));
    sendSuccess(res, { jobs });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to list connector jobs');
  }
});

// POST /internal/v1/connectors/jobs/:jobId/result
connectorDeviceRouter.post('/jobs/:jobId/result', async (req: ConnectorAuthedRequest, res: Response) => {
  try {
    const ok = completeJob(req.connector!.id, req.params.jobId, req.body);
    if (!ok) {
      sendError(res, 404, 'NOT_FOUND', 'Job not found, expired, or not owned by this connector');
      return;
    }
    sendSuccess(res, { ok: true });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to record job result');
  }
});

// GET /internal/v1/connectors/ai/cameras
// Cameras this connector should watch, plus each one's footfall counting-line config —
// lets the AI worker run ON the connector's machine for cameras the cloud can't reach.
connectorDeviceRouter.get('/ai/cameras', async (req: ConnectorAuthedRequest, res: Response) => {
  try {
    const cameras = await CameraModel.find({ connectorId: req.connector!.id });
    const resolved = await Promise.all(
      cameras.map(async (cam) => {
        const streamUrl = tryResolveDecryptedStreamUrl(cam);
        if (streamUrl === null) return null; // undecryptable: skip just this camera
        const line = await CountingLineModel.findOne({ cameraId: cam._id });
        return {
          id: cam._id.toString(),
          shopId: cam.shopId.toString(),
          name: cam.name,
          connectionType: cam.connectionType,
          streamUrl,
          countingLine: line
            ? {
                coordinates: line.coordinates,
                inDirection: line.inDirection,
                outDirection: line.outDirection,
                enabled: line.enabled,
              }
            : null,
        };
      })
    );
    const items = resolved.filter((item): item is NonNullable<typeof item> => item !== null);
    // ai-worker's client.py (both standalone and connector mode) reads this as
    // data.cameras, each with a shopId - required so connector-mode footfall events
    // can be attributed to the right shop.
    sendSuccess(res, { cameras: items });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to list connector AI cameras');
  }
});

// GET /internal/v1/connectors/ai/live-wanted
// Which of this connector's cameras currently have an owner watching Live View.
connectorDeviceRouter.get('/ai/live-wanted', async (req: ConnectorAuthedRequest, res: Response) => {
  try {
    const cameras = await CameraModel.find({ connectorId: req.connector!.id }).select('_id');
    const ids = cameras.map((c) => c._id.toString());
    sendSuccess(res, { cameraIds: wantedLive(ids) });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to resolve live-wanted cameras');
  }
});

// POST /internal/v1/connectors/ai/live-frame/:cameraId
// Raw JPEG body — rate-limited by the worker itself (fast while watched, slow otherwise).
connectorDeviceRouter.post(
  '/ai/live-frame/:cameraId',
  express.raw({ type: 'image/jpeg', limit: '2mb' }),
  async (req: ConnectorAuthedRequest, res: Response) => {
    try {
      const { cameraId } = req.params;
      const owned = await CameraModel.exists({ _id: cameraId, connectorId: req.connector!.id });
      if (!owned) {
        sendError(res, 404, 'NOT_FOUND', 'Camera not found for this connector');
        return;
      }
      storeFrame(cameraId, req.body as Buffer);
      res.status(204).end();
    } catch (err: any) {
      sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to store live frame');
    }
  }
);

// POST /internal/v1/connectors/ai/camera-status
// Real frame-based online/offline (distinct from the TCP/RTSP probe behind "Test connection").
connectorDeviceRouter.post('/ai/camera-status', async (req: ConnectorAuthedRequest, res: Response) => {
  try {
    const { cameraId, online, errorCode } = req.body as { cameraId?: string; online?: boolean; errorCode?: string };
    if (!cameraId) {
      sendError(res, 400, 'BAD_REQUEST', 'cameraId is required');
      return;
    }
    const owned = await CameraModel.exists({ _id: cameraId, connectorId: req.connector!.id });
    if (!owned) {
      sendError(res, 404, 'NOT_FOUND', 'Camera not found for this connector');
      return;
    }
    await recordCameraHealth(cameraId, {
      status: online ? 'ONLINE' : 'OFFLINE',
      safeErrorCode: online ? undefined : errorCode,
    });
    sendSuccess(res, { ok: true });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to record camera status');
  }
});

// POST /internal/v1/connectors/ai/events
// Same event schema/handler as the standalone AI-service-secret path, scoped to this
// connector's own cameras so one connector can't attribute events to a shop it isn't paired to.
connectorDeviceRouter.post('/ai/events', async (req: ConnectorAuthedRequest, res: Response) => {
  try {
    const eventsToProcess = parseIngestEventsBody(req.body);
    if (!eventsToProcess) {
      sendError(res, 400, 'BAD_REQUEST', 'Request body must contain eventId or events array');
      return;
    }

    const owned = await CameraModel.find({ connectorId: req.connector!.id }).select('_id');
    const ownedIds = new Set(owned.map((c) => c._id.toString()));
    const scoped = eventsToProcess.filter((evt) => ownedIds.has(evt.cameraId));

    const result = await ingestFootfallEvents(scoped);
    sendSuccess<IngestEventResponseData>(res, result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to ingest footfall events');
  }
});

// POST /internal/v1/connectors/ai/health
connectorDeviceRouter.post('/ai/health', async (req: ConnectorAuthedRequest, res: Response) => {
  try {
    const { cameraId, status, safeErrorCode, message } = req.body as AIHeartbeatRequest & { safeErrorCode?: string };
    if (!cameraId) {
      sendError(res, 400, 'BAD_REQUEST', 'cameraId is required');
      return;
    }
    const owned = await CameraModel.exists({ _id: cameraId, connectorId: req.connector!.id });
    if (!owned) {
      sendError(res, 404, 'NOT_FOUND', `Camera '${cameraId}' not found for this connector`);
      return;
    }
    const camera = await recordCameraHealth(cameraId, { status, safeErrorCode: safeErrorCode || message });
    sendSuccess(res, {
      acknowledged: true,
      cameraId,
      status: camera!.status,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to process AI health heartbeat');
  }
});
