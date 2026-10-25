import { Router, Response } from 'express';
import { promises as fsPromises } from 'fs';
import { CameraModel } from '../models/Camera.js';
import { CountingLineModel } from '../models/CountingLine.js';
import { ShopModel } from '../models/Shop.js';
import { ConnectorModel } from '../models/Connector.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { requireAuth, requireShopAccess, AuthenticatedRequest } from '../middleware/auth.js';
import { encryptCredential, sanitizeStreamUrl } from '../utils/crypto.js';
import { resolveDecryptedStreamUrl } from '../utils/cameraStream.js';
import { probeStreamReachability } from '../utils/streamProbe.js';
import { 
  CreateCameraRequest, 
  SetCountingLineRequest, 
  Camera, 
  CountingLine, 
  CameraTestResponseData 
} from '@dbi/shared-types';

export const cameraRouter = Router({ mergeParams: true });

/**
 * POST /api/v1/shops/:shopId/cameras
 * Add entrance camera to shop (credentials encrypted with AES-256)
 */
cameraRouter.post('/shops/:shopId/cameras', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, connectionType, streamUrl, rtspUrl, username, password, connectorId } = req.body as any;
    const finalStreamUrl = streamUrl || rtspUrl;

    if (!name || !finalStreamUrl) {
      sendError(res, 400, 'BAD_REQUEST', 'Camera name and streamUrl or rtspUrl are required');
      return;
    }

    if (connectorId) {
      const connector = await ConnectorModel.findById(connectorId);
      if (!connector || connector.shopId.toString() !== req.shop!._id.toString()) {
        sendError(res, 400, 'BAD_REQUEST', 'connectorId does not refer to a connector on this shop');
        return;
      }
    }

    const type = connectionType || 'RTSP';
    const hasCredentials = Boolean(username || password);

    // Encrypt sensitive details
    const encryptedStreamUrl = encryptCredential(finalStreamUrl);
    const sanitizedUrl = sanitizeStreamUrl(finalStreamUrl);

    let encryptedCredentials: string | undefined;
    if (hasCredentials) {
      encryptedCredentials = encryptCredential(JSON.stringify({ username, password }));
    }

    // Determine initial status: TEST_CLIP/MOCK_STREAM is immediately ONLINE, RTSP starts CONNECTING
    const isClip = type === 'TEST_CLIP' || type === 'MOCK_STREAM';
    const initialStatus = isClip ? 'ONLINE' : 'CONNECTING';

    const camera = await CameraModel.create({
      shopId: req.shop!._id,
      connectorId: connectorId || null,
      name: name.trim(),
      connectionType: type,
      encryptedStreamUrl,
      sanitizedStreamUrl: sanitizedUrl,
      encryptedCredentials,
      hasCredentials,
      status: initialStatus,
      lastHeartbeatAt: isClip ? new Date() : undefined,
      safeErrorCode: type === 'MOCK_STREAM' ? 'DEMO_CLIP_ACTIVE' : undefined,
    });

    sendSuccess<Camera>(res, camera.toResponseObject(), 201);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to add camera');
  }
});

/**
 * GET /api/v1/shops/:shopId/cameras
 * List cameras for shop (strictly sanitized responses)
 */
cameraRouter.get('/shops/:shopId/cameras', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cameras = await CameraModel.find({ shopId: req.shop!._id }).sort({ createdAt: -1 });
    sendSuccess<Camera[]>(res, cameras.map((c) => c.toResponseObject()));
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch cameras');
  }
});

/**
 * Helper to check access for camera-scoped endpoints
 */
async function checkCameraAccess(req: AuthenticatedRequest, res: Response): Promise<any | null> {
  const { cameraId } = req.params;
  const camera = await CameraModel.findById(cameraId);
  if (!camera) {
    sendError(res, 404, 'NOT_FOUND', `Camera with id '${cameraId}' not found`);
    return null;
  }

  const shop = await ShopModel.findById(camera.shopId);
  if (!shop) {
    sendError(res, 404, 'NOT_FOUND', 'Associated shop not found');
    return null;
  }

  if (req.user!.role !== 'SUPER_ADMIN' && shop.ownerUserId.toString() !== req.user!._id.toString()) {
    sendError(res, 403, 'TENANT_VIOLATION', 'Access denied to this camera');
    return null;
  }

  return { camera, shop };
}

/**
 * GET /api/v1/cameras/:cameraId
 */
cameraRouter.get('/cameras/:cameraId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const context = await checkCameraAccess(req, res);
  if (!context) return;
  sendSuccess<Camera>(res, context.camera.toResponseObject());
});

/**
 * PATCH /api/v1/shops/:shopId/cameras/:cameraId
 * PATCH /api/v1/cameras/:cameraId
 */
cameraRouter.patch(['/shops/:shopId/cameras/:cameraId', '/cameras/:cameraId'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    const { name, connectionType, streamUrl, rtspUrl, connectorId } = req.body;

    if (name) camera.name = name.trim();
    if (connectionType) camera.connectionType = connectionType;
    if (connectorId !== undefined) {
      if (connectorId) {
        const connector = await ConnectorModel.findById(connectorId);
        if (!connector || connector.shopId.toString() !== camera.shopId.toString()) {
          sendError(res, 400, 'BAD_REQUEST', 'connectorId does not refer to a connector on this shop');
          return;
        }
      }
      camera.connectorId = connectorId || null;
    }
    const finalStreamUrl = streamUrl || rtspUrl;
    if (finalStreamUrl && !finalStreamUrl.includes('****')) {
      camera.encryptedStreamUrl = encryptCredential(finalStreamUrl);
      camera.sanitizedStreamUrl = sanitizeStreamUrl(finalStreamUrl);
    }

    await camera.save();
    sendSuccess<Camera>(res, camera.toResponseObject());
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to update camera');
  }
});

/**
 * POST /api/v1/cameras/:cameraId/test
 * Real stream connectivity test — not simulated. RTSP/HTTP_STREAM/WEBCAM get an actual
 * TCP reachability probe (ported from the sibling theaft-ai project's camera test);
 * TEST_CLIP gets a real check that the local clip file exists; MOCK_STREAM is the one
 * intentionally-fake case (pure UI demo, nothing to probe).
 */
cameraRouter.post('/cameras/:cameraId/test', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    const startMs = Date.now();

    if (camera.connectionType === 'MOCK_STREAM') {
      camera.status = 'DEGRADED';
      camera.lastHeartbeatAt = new Date();
      camera.safeErrorCode = 'DEMO_CLIP_ACTIVE';
      await camera.save();

      sendSuccess<CameraTestResponseData>(res, {
        cameraId: camera._id.toString(),
        accessible: true,
        isReachable: true,
        status: camera.status,
        latencyMs: Date.now() - startMs,
        safeErrorCode: camera.safeErrorCode,
        message: 'Mock demo stream active — this connection type has no real source to check',
        testedAt: new Date().toISOString(),
      });
      return;
    }

    const streamUrl = resolveDecryptedStreamUrl(camera);
    let reachable: boolean;
    let errorCode: string | undefined;
    let message: string;

    if (camera.connectionType === 'TEST_CLIP') {
      try {
        await fsPromises.access(streamUrl);
        reachable = true;
        message = 'Test clip file found and accessible';
      } catch {
        reachable = false;
        errorCode = 'CLIP_FILE_NOT_FOUND';
        message = 'Test clip file not found at the configured path';
      }
    } else {
      const probe = await probeStreamReachability(streamUrl);
      reachable = probe.reachable;
      errorCode = probe.errorCode;
      message = reachable
        ? 'RTSP stream connection established and reachable'
        : `Stream unreachable: ${probe.errorCode || 'UNKNOWN_ERROR'}`;
    }

    camera.status = reachable ? 'ONLINE' : errorCode === 'INVALID_STREAM_URL' ? 'CONFIG_ERROR' : 'OFFLINE';
    if (reachable) camera.lastHeartbeatAt = new Date();
    camera.safeErrorCode = reachable ? undefined : errorCode;
    await camera.save();

    sendSuccess<CameraTestResponseData>(res, {
      cameraId: camera._id.toString(),
      accessible: reachable,
      isReachable: reachable,
      status: camera.status,
      latencyMs: Date.now() - startMs,
      safeErrorCode: camera.safeErrorCode || null,
      message,
      testedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Camera test failed');
  }
});

/**
 * GET /api/v1/cameras/:cameraId/health
 * Inspect camera health and evaluate stale heartbeat
 */
cameraRouter.get('/cameras/:cameraId/health', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    // Evaluate stale heartbeat: If last heartbeat > 90 seconds ago, mark OFFLINE
    const timeoutMs = 90 * 1000;
    const now = Date.now();
    const lastHb = camera.lastHeartbeatAt ? new Date(camera.lastHeartbeatAt).getTime() : 0;

    if (camera.status === 'ONLINE' && (!camera.lastHeartbeatAt || now - lastHb > timeoutMs)) {
      camera.status = 'OFFLINE';
      camera.safeErrorCode = 'HEARTBEAT_TIMEOUT';
      await camera.save();
    }

    sendSuccess(res, {
      cameraId: camera._id.toString(),
      status: camera.status,
      lastHeartbeatAt: camera.lastHeartbeatAt ? camera.lastHeartbeatAt.toISOString() : undefined,
      safeErrorCode: camera.safeErrorCode,
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to inspect camera health');
  }
});

/**
 * PUT /api/v1/cameras/:cameraId/counting-line
 * Configure normalized virtual line coordinates
 */
cameraRouter.put('/cameras/:cameraId/counting-line', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    const { coordinates, inDirection, outDirection, enabled } = req.body as SetCountingLineRequest;

    if (!coordinates || typeof coordinates !== 'object') {
      sendError(res, 400, 'INVALID_COORDINATES', 'Normalized coordinates { x1, y1, x2, y2 } are required');
      return;
    }

    const { x1, y1, x2, y2 } = coordinates;
    const isCoordinateValid = (val: any) => typeof val === 'number' && !isNaN(val) && val >= 0.0 && val <= 1.0;

    if (!isCoordinateValid(x1) || !isCoordinateValid(y1) || !isCoordinateValid(x2) || !isCoordinateValid(y2)) {
      sendError(
        res,
        400,
        'INVALID_COORDINATES',
        'All coordinates (x1, y1, x2, y2) must be normalized numbers between 0.0 and 1.0'
      );
      return;
    }

    // Upsert counting line
    const countingLine = await CountingLineModel.findOneAndUpdate(
      { cameraId: camera._id },
      {
        shopId: camera.shopId,
        cameraId: camera._id,
        coordinates: { x1, y1, x2, y2 },
        inDirection: inDirection || 'TOP_TO_BOTTOM',
        outDirection: outDirection || 'BOTTOM_TO_TOP',
        enabled: enabled !== undefined ? enabled : true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    sendSuccess<CountingLine>(res, countingLine.toResponseObject());
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to update counting line');
  }
});

/**
 * GET /api/v1/cameras/:cameraId/counting-line
 * Fetch configured virtual line
 */
cameraRouter.get('/cameras/:cameraId/counting-line', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    const countingLine = await CountingLineModel.findOne({ cameraId: camera._id });
    if (!countingLine) {
      sendError(res, 404, 'NOT_FOUND', 'Counting line has not been configured for this camera');
      return;
    }

    sendSuccess<CountingLine>(res, countingLine.toResponseObject());
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch counting line');
  }
});

/**
 * DELETE /api/v1/cameras/:cameraId
 * Removes the camera and its counting line. Does not touch footfallEvents/aggregates
 * already recorded — historical analytics stay intact.
 */
cameraRouter.delete('/cameras/:cameraId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    await CountingLineModel.deleteOne({ cameraId: camera._id });
    await CameraModel.findByIdAndDelete(camera._id);

    sendSuccess(res, { id: camera._id.toString(), message: 'Camera deleted successfully' });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to delete camera');
  }
});
