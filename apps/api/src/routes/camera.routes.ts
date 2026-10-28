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
import { buildRtspUrl } from '../utils/rtsp.js';
import { effectiveCameraStatus } from '../utils/cameraStatus.js';
import { probeStreamReachability } from '../utils/streamProbe.js';
import { isConnectorOnline } from '../services/connectorManager.js';
import { enqueueJob, waitForJob, peekJob, isJobDone } from '../services/connectorJobs.js';
import { requestLive, getFrame } from '../services/connectorLive.js';
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
    const { name, connectionType, streamUrl, rtspUrl, username, password, connectorId, host, port, path } = req.body as any;
    let finalStreamUrl = streamUrl || rtspUrl;

    // Structured form (host/port/user/password/path): build the URL server-side so special
    // characters in the password are encoded. Empty path -> generic default (/stream1).
    if (!finalStreamUrl && host) {
      try {
        finalStreamUrl = buildRtspUrl({ host, port, username, password, path });
      } catch (e: any) {
        sendError(res, 400, 'BAD_REQUEST', e.message);
        return;
      }
    }

    if (!name || !finalStreamUrl) {
      sendError(res, 400, 'BAD_REQUEST', 'Camera name and streamUrl, rtspUrl or host are required');
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
 * POST /api/v1/shops/:shopId/cameras/use-substream
 * "Use light streams": for every connector-backed Hikvision camera on this shop whose
 * path is the heavy main stream (/Streaming/Channels/N01), verify the lighter sub-stream
 * (N02) actually answers with video via the Connector, and only then switch to it.
 * Cameras whose connector is offline, or whose sub-stream doesn't verify, are left alone.
 */
cameraRouter.post('/shops/:shopId/cameras/use-substream', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cameras = await CameraModel.find({ shopId: req.shop!._id, connectorId: { $ne: null } });

    let total = 0;
    let changed = 0;
    let skipped = 0;

    for (const camera of cameras) {
      let streamUrl: string;
      let parsed: URL;
      try {
        streamUrl = resolveDecryptedStreamUrl(camera);
        parsed = new URL(streamUrl);
      } catch {
        continue;
      }

      const match = parsed.pathname.match(/^(\/Streaming\/Channels\/\d+)01$/i);
      if (!match) continue;

      total++;

      const connector = await ConnectorModel.findById(camera.connectorId);
      if (!connector || !isConnectorOnline(connector)) {
        skipped++;
        continue;
      }

      const subParsed = new URL(streamUrl);
      subParsed.pathname = `${match[1]}02`;
      const subStreamUrl = subParsed.toString();

      const jobId = enqueueJob(camera.connectorId!.toString(), camera._id.toString(), 'PROBE', subStreamUrl);
      const result = await waitForJob(jobId, 14000);

      if (result && (result as any).reachable) {
        camera.encryptedStreamUrl = encryptCredential(subStreamUrl);
        camera.sanitizedStreamUrl = sanitizeStreamUrl(subStreamUrl);
        camera.status = 'CONNECTING';
        camera.safeErrorCode = undefined;
        await camera.save();
        changed++;
      } else {
        skipped++;
      }
    }

    sendSuccess(res, { total, changed, skipped });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to switch to light streams');
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

    const { name, connectionType, streamUrl, rtspUrl, connectorId, username, password } = req.body;

    if (name) camera.name = name.trim();
    if (username || password) {
      // Changed credentials: store them separately and drop any user:pass embedded in the
      // stored URL (resolveDecryptedStreamUrl only merges credentials into a URL without any).
      camera.encryptedCredentials = encryptCredential(JSON.stringify({ username, password }));
      camera.hasCredentials = true;
      if (!streamUrl && !rtspUrl) {
        try {
          const bare = sanitizeStreamUrl(resolveDecryptedStreamUrl(camera));
          camera.encryptedStreamUrl = encryptCredential(bare);
          camera.sanitizedStreamUrl = bare;
        } catch {
          // stored URL can't be decrypted (e.g. key changed) - owner must re-enter the URL too
        }
      }
    }
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
    } else if (camera.connectorId) {
      // Connector-backed camera: the API can't reach the shop's LAN itself, so it asks
      // the paired Connector to do the real RTSP check and waits a bounded time for the
      // answer. 12s is deliberately shorter than the owner app's own request timeout so
      // a stalled connector surfaces as CONNECTOR_TIMEOUT, not a generic network error.
      const connector = await ConnectorModel.findById(camera.connectorId);
      if (!connector || !isConnectorOnline(connector)) {
        reachable = false;
        errorCode = 'CONNECTOR_OFFLINE';
        message = 'The on-site Connector for this camera is offline';
      } else {
        const jobId = enqueueJob(camera.connectorId.toString(), camera._id.toString(), 'PROBE', streamUrl);
        const result = await waitForJob(jobId, 12000);
        if (!result) {
          reachable = false;
          errorCode = 'CONNECTOR_TIMEOUT';
          message = 'The Connector did not respond in time';
        } else {
          reachable = Boolean((result as any).reachable);
          errorCode = (result as any).errorCode;
          message = reachable
            ? 'RTSP stream connection established and reachable'
            : `Stream unreachable: ${errorCode || 'UNKNOWN_ERROR'}`;
        }
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

    // Stale heartbeat => OFFLINE (shared rule, see utils/cameraStatus.ts). Persist it so
    // other readers of the stored status agree with what the owner sees.
    const effective = effectiveCameraStatus(camera);
    if (effective.status !== camera.status) {
      camera.status = effective.status as typeof camera.status;
      camera.safeErrorCode = effective.safeErrorCode;
      await camera.save();
    }

    sendSuccess(res, {
      cameraId: camera._id.toString(),
      status: effective.status,
      lastHeartbeatAt: camera.lastHeartbeatAt ? camera.lastHeartbeatAt.toISOString() : undefined,
      safeErrorCode: effective.safeErrorCode,
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to inspect camera health');
  }
});

/**
 * POST /api/v1/cameras/:cameraId/channels/scan
 * "Find channels": asks this camera's Connector to scan the Hikvision/Dahua recorder
 * for every channel that answers with real video. Async — can take up to ~a minute.
 */
cameraRouter.post('/cameras/:cameraId/channels/scan', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    if (!camera.connectorId) {
      sendError(res, 400, 'NO_CONNECTOR', 'This camera has no on-site Connector to scan with');
      return;
    }
    const connector = await ConnectorModel.findById(camera.connectorId);
    if (!connector || !isConnectorOnline(connector)) {
      sendError(res, 409, 'CONNECTOR_OFFLINE', 'The on-site Connector for this camera is offline');
      return;
    }

    const streamUrl = resolveDecryptedStreamUrl(camera);
    const jobId = enqueueJob(camera.connectorId.toString(), camera._id.toString(), 'DISCOVER', streamUrl);
    sendSuccess(res, { jobId }, 202);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to start channel scan');
  }
});

/**
 * GET /api/v1/cameras/:cameraId/channels/scan/:jobId
 * Polled by the owner app while the Connector's scan is running.
 */
cameraRouter.get('/cameras/:cameraId/channels/scan/:jobId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    const job = peekJob(req.params.jobId);
    // A scan result (thumbnails of someone's cameras) is only readable via the camera it was started for.
    if (job && job.cameraId !== camera._id.toString()) {
      sendError(res, 404, 'NOT_FOUND', 'Scan job not found');
      return;
    }
    if (!isJobDone(job)) {
      sendSuccess(res, { status: 'PENDING' });
      return;
    }

    const result = (job!.result || {}) as { channels?: any[]; error?: string; debug?: string };

    // Flag channels that are already registered as cameras on this shop, keyed by
    // host:port+path so a re-scan doesn't suggest adding the same channel twice.
    const sourceUrl = resolveDecryptedStreamUrl(camera);
    let sourceHost = '';
    let sourcePort = '';
    try {
      const u = new URL(sourceUrl);
      sourceHost = u.hostname;
      sourcePort = u.port;
    } catch {
      // non-URL stream value; dedup just won't match anything, which is safe
    }

    const siblingCameras = await CameraModel.find({ shopId: camera.shopId });
    const existingPathKeys = new Set<string>();
    for (const sibling of siblingCameras) {
      try {
        const u = new URL(resolveDecryptedStreamUrl(sibling));
        existingPathKeys.add(`${u.hostname}:${u.port}${u.pathname}${u.search}`);
      } catch {
        // skip non-URL stream values (e.g. TEST_CLIP paths)
      }
    }

    const channels = (result.channels || []).map((ch: any) => ({
      ...ch,
      alreadyAdded: existingPathKeys.has(`${sourceHost}:${sourcePort}${ch.path}`),
    }));

    sendSuccess(res, {
      status: 'DONE',
      channels,
      error: result.error,
      debug: result.debug ? result.debug.slice(0, 300) : undefined,
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch channel scan result');
  }
});

/**
 * POST /api/v1/cameras/:cameraId/channels/add
 * Adds one scanned channel as a new camera, cloning the source camera's host/credentials.
 */
cameraRouter.post('/cameras/:cameraId/channels/add', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    const { path, name } = req.body as { path?: string; name?: string };
    if (!path || typeof path !== 'string' || !path.startsWith('/') || path.length > 300 || path.includes('#')) {
      sendError(res, 400, 'BAD_REQUEST', 'A valid channel path is required');
      return;
    }

    let newUrl: string;
    try {
      const u = new URL(resolveDecryptedStreamUrl(camera));
      const [pathname, query] = path.split('?');
      u.pathname = pathname;
      u.search = query ? `?${query}` : '';
      newUrl = u.toString();
    } catch {
      sendError(res, 400, 'BAD_REQUEST', 'Source camera does not have a URL-style stream to clone');
      return;
    }

    const newCamera = await CameraModel.create({
      shopId: camera.shopId,
      connectorId: camera.connectorId,
      name: (name && name.trim()) || camera.name,
      connectionType: camera.connectionType,
      encryptedStreamUrl: encryptCredential(newUrl),
      sanitizedStreamUrl: sanitizeStreamUrl(newUrl),
      encryptedCredentials: camera.encryptedCredentials,
      hasCredentials: camera.hasCredentials,
      status: 'CONNECTING',
    });

    sendSuccess<Camera>(res, newCamera.toResponseObject(), 201);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to add channel');
  }
});

/**
 * POST /api/v1/cameras/:cameraId/webrtc
 * Relays a browser's WebRTC SDP offer to the camera's Connector (which answers via a
 * bundled go2rtc) and returns the answer. 15s bound, same chained-timeout reasoning as /test.
 */
cameraRouter.post('/cameras/:cameraId/webrtc', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    const { camera } = context;

    const { sdp } = req.body as { sdp?: string };
    if (!sdp || typeof sdp !== 'string' || !sdp.startsWith('v=0') || sdp.length > 20000) {
      sendError(res, 400, 'BAD_REQUEST', 'A valid SDP offer is required');
      return;
    }
    if (!camera.connectorId) {
      sendError(res, 400, 'NO_CONNECTOR', 'This camera has no on-site Connector for WebRTC live view');
      return;
    }
    const connector = await ConnectorModel.findById(camera.connectorId);
    if (!connector || !isConnectorOnline(connector)) {
      sendError(res, 409, 'CONNECTOR_OFFLINE', 'The on-site Connector for this camera is offline');
      return;
    }

    const streamUrl = resolveDecryptedStreamUrl(camera);
    const jobId = enqueueJob(camera.connectorId.toString(), camera._id.toString(), 'WEBRTC', streamUrl, { sdp });
    const result = await waitForJob(jobId, 15000);

    if (!result) {
      sendError(res, 502, 'CONNECTOR_TIMEOUT', 'The Connector did not answer the WebRTC offer in time');
      return;
    }
    const answer = (result as any).answer;
    if (!answer) {
      sendError(res, 502, 'WEBRTC_FAILED', (result as any).error || 'The Connector could not start a WebRTC stream');
      return;
    }

    sendSuccess(res, { answer });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to relay WebRTC offer');
  }
});

/**
 * POST /api/v1/cameras/:cameraId/live
 * Marks this camera as "being watched" for 30s — the picture-fallback keep-alive.
 */
cameraRouter.post('/cameras/:cameraId/live', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;
    requestLive(context.camera._id.toString());
    sendSuccess(res, { expiresAt: new Date(Date.now() + 30000).toISOString() });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to request live view');
  }
});

/**
 * GET /api/v1/cameras/:cameraId/live.jpg
 * Latest pushed frame for this camera. 204 (not 404) when none has arrived yet — "no
 * picture yet" is not an error.
 */
cameraRouter.get('/cameras/:cameraId/live.jpg', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const context = await checkCameraAccess(req, res);
    if (!context) return;

    const frame = getFrame(context.camera._id.toString());
    if (!frame) {
      res.status(204).end();
      return;
    }

    res.set({
      'Cache-Control': 'no-store',
      'x-frame-at': new Date(frame.at).toISOString(),
      'Content-Type': 'image/jpeg',
    });
    res.status(200).send(frame.jpeg);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch live frame');
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
