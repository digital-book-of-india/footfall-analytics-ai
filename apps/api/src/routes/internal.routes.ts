import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAiServiceSecret } from '../middleware/aiAuth.js';
import { FootfallEventModel } from '../models/FootfallEvent.js';
import { FootfallAggregateModel } from '../models/FootfallAggregate.js';
import { CameraModel, ICameraDocument } from '../models/Camera.js';
import { CountingLineModel } from '../models/CountingLine.js';
import { ZoneModel } from '../models/Zone.js';
import { SecurityEventModel } from '../models/SecurityEvent.js';
import { ShopModel } from '../models/Shop.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { tryResolveDecryptedStreamUrl } from '../utils/cameraStream.js';
import { floorToLocalHourUtc } from '../utils/timezone.js';
import { writeEvidenceFile, safeResolve } from '../services/evidence/storage.js';
import {
  IngestFootfallEventRequest,
  IngestEventResponseData,
  IngestSecurityEventRequest,
  IngestSecurityEventResponseData,
  AIHeartbeatRequest
} from '@dbi/shared-types';

export const internalRouter = Router();

// Apply AI service secret auth to all internal routes
internalRouter.use(requireAiServiceSecret);

const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/** Connection types the AI worker can open a real video source for (never MOCK_STREAM, which is pure demo). */
const REAL_VIDEO_CONNECTION_TYPES = new Set(['RTSP', 'TEST_CLIP', 'HTTP_STREAM', 'WEBCAM']);

/** Per-request cache so a batch of events for the same shop only looks its timezone up once. */
const shopTimezoneCache = new Map<string, string>();
async function getShopTimezone(shopId: string): Promise<string> {
  const cached = shopTimezoneCache.get(shopId);
  if (cached) return cached;
  const shop = await ShopModel.findById(shopId).select('timezone').lean();
  const timeZone = shop?.timezone || 'Asia/Kolkata';
  shopTimezoneCache.set(shopId, timeZone);
  return timeZone;
}

/**
 * Increments (or creates) the hourly footfallAggregates bucket for a processed event,
 * bucketed on the shop's own LOCAL hour (not the UTC hour) so these buckets line up
 * with the dashboard's hourly chart grid (see analytics.service.ts's getTimeseries).
 */
async function bumpHourlyAggregate(shopId: string, direction: 'IN' | 'OUT', occurredAt: Date): Promise<void> {
  const timeZone = await getShopTimezone(shopId);
  const bucketStartUtc = floorToLocalHourUtc(occurredAt, timeZone);
  const inc = direction === 'IN' ? { entries: 1 } : { exits: 1 };
  await FootfallAggregateModel.findOneAndUpdate(
    { shopId, bucketStartUtc, bucketType: 'HOUR' },
    { $inc: inc, $setOnInsert: { quality: 'OK' } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * Shared event-ingestion core (dedup/idempotency, hourly aggregate bump, camera
 * lastHeartbeatAt touch). Used by both the standalone AI-service-secret path below and
 * the connector-scoped /internal/v1/connectors/ai/events route — one event schema, two
 * auth boundaries.
 */
export async function ingestFootfallEvents(
  eventsToProcess: IngestFootfallEventRequest[]
): Promise<IngestEventResponseData> {
  let processed = 0;
  let ignoredDuplicates = 0;
  const touchedCameras = new Set<string>();

  for (const evt of eventsToProcess) {
    const { eventId, shopId, cameraId, direction, occurredAt, confidence, modelVersion } = evt;

    if (!eventId || !shopId || !cameraId || !direction) {
      continue;
    }

    if (direction !== 'IN' && direction !== 'OUT') {
      continue;
    }

    try {
      await FootfallEventModel.create({
        eventId,
        shopId,
        cameraId,
        direction,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        confidence: typeof confidence === 'number' ? confidence : 0.9,
        modelVersion: modelVersion || 'yolo-crossing-v1.0',
      });
      processed++;
      touchedCameras.add(cameraId);
      await bumpHourlyAggregate(shopId, direction, occurredAt ? new Date(occurredAt) : new Date());
    } catch (insertErr: any) {
      // E11000 duplicate key error means this eventId was already ingested!
      if (insertErr.code === 11000) {
        ignoredDuplicates++;
      } else {
        console.error(`[Event Ingestion] Unexpected error for eventId ${eventId}:`, insertErr);
      }
    }
  }

  // Refresh lastHeartbeatAt for cameras producing events
  if (touchedCameras.size > 0) {
    await CameraModel.updateMany(
      { _id: { $in: Array.from(touchedCameras) } },
      {
        $set: {
          status: 'ONLINE',
          lastHeartbeatAt: new Date()
        }
      }
    );
  }

  return { processed, ignoredDuplicates };
}

/** Parses the three request shapes the AI worker may send (single/array/{events:[]}). */
export function parseIngestEventsBody(body: any): IngestFootfallEventRequest[] | null {
  if (Array.isArray(body)) return body;
  if (body && body.events && Array.isArray(body.events)) return body.events;
  if (body && body.eventId) return [body as IngestFootfallEventRequest];
  return null;
}

/**
 * Shared health-heartbeat core. Used by both the standalone path below and the
 * connector-scoped /internal/v1/connectors/ai/health route.
 */
export async function recordCameraHealth(
  cameraId: string,
  updates: { status?: AIHeartbeatRequest['status']; safeErrorCode?: string }
): Promise<ICameraDocument | null> {
  const camera = await CameraModel.findById(cameraId);
  if (!camera) return null;

  camera.lastHeartbeatAt = new Date();
  if (updates.status) {
    camera.status = updates.status;
  }
  camera.safeErrorCode = updates.safeErrorCode || undefined;

  await camera.save();
  return camera;
}

/**
 * Shared security-event (zone-watch alert) ingestion core — mirrors ingestFootfallEvents's
 * dedup/idempotency shape, but for PERSON_IN_ZONE / POSSIBLE_SHUTTER_INTERACTION / etc. events.
 * Used by both the standalone path below and the connector-scoped
 * /internal/v1/connectors/ai/security-events route.
 */
export async function ingestSecurityEvents(
  eventsToProcess: IngestSecurityEventRequest[]
): Promise<IngestSecurityEventResponseData> {
  let processed = 0;
  let ignoredDuplicates = 0;

  for (const evt of eventsToProcess) {
    const { eventId, shopId, cameraId, eventType, confidence, startedAt, evidence, region, modelVersion } = evt;
    if (!eventId || !shopId || !cameraId || !eventType) continue;

    try {
      await SecurityEventModel.create({
        eventId,
        shopId,
        cameraId,
        eventType,
        confidence: typeof confidence === 'number' ? confidence : 0.7,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        evidence: evidence || {},
        region,
        modelVersion,
      });
      processed++;
    } catch (insertErr: any) {
      if (insertErr.code === 11000) {
        ignoredDuplicates++;
      } else {
        console.error(`[Security Event Ingestion] Unexpected error for eventId ${eventId}:`, insertErr);
      }
    }
  }

  return { processed, ignoredDuplicates };
}

/**
 * POST /internal/v1/footfall/events
 * Ingest high-frequency crossing events with strict deduplication / idempotency
 */
internalRouter.post('/events', async (req: Request, res: Response) => {
  try {
    const eventsToProcess = parseIngestEventsBody(req.body);
    if (!eventsToProcess) {
      sendError(res, 400, 'BAD_REQUEST', 'Request body must contain eventId or events array');
      return;
    }

    const result = await ingestFootfallEvents(eventsToProcess);
    sendSuccess<IngestEventResponseData>(res, result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to ingest footfall events');
  }
});

/**
 * POST /internal/v1/footfall/security-events
 * Ingest zone-watch alerts (PERSON_IN_ZONE / POSSIBLE_SHUTTER_INTERACTION / ...), separate from
 * the entry/exit crossing events above since they carry evidence and a review workflow.
 */
internalRouter.post('/security-events', async (req: Request, res: Response) => {
  try {
    const eventsToProcess = parseIngestEventsBody(req.body) as unknown as IngestSecurityEventRequest[] | null;
    if (!eventsToProcess) {
      sendError(res, 400, 'BAD_REQUEST', 'Request body must contain eventId or events array');
      return;
    }

    const result = await ingestSecurityEvents(eventsToProcess);
    sendSuccess<IngestSecurityEventResponseData>(res, result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to ingest security events');
  }
});

/**
 * POST /internal/v1/footfall/evidence/upload
 * Stores a zone-watch alert's annotated JPEG snapshot (red box on the detected person, see
 * ai-worker's reporting/snapshot.py). multipart/form-data: field `objectKey` + field `file`.
 */
internalRouter.post('/evidence/upload', evidenceUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const objectKey = (req.body as any)?.objectKey;
    if (!objectKey || typeof objectKey !== 'string' || !safeResolve(objectKey)) {
      sendError(res, 400, 'BAD_REQUEST', 'A valid objectKey is required');
      return;
    }
    if (!req.file) {
      sendError(res, 400, 'BAD_REQUEST', 'A file is required');
      return;
    }
    const ok = await writeEvidenceFile(objectKey, req.file.buffer);
    if (!ok) {
      sendError(res, 400, 'BAD_REQUEST', 'Invalid objectKey');
      return;
    }
    sendSuccess(res, { objectKey });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to store evidence file');
  }
});

/**
 * POST /internal/v1/footfall/health
 * AI Worker heartbeat receiver for stream health and metrics
 */
internalRouter.post('/health', async (req: Request, res: Response) => {
  try {
    const { cameraId, status, safeErrorCode, message } = req.body as AIHeartbeatRequest & { safeErrorCode?: string };

    if (!cameraId) {
      sendError(res, 400, 'BAD_REQUEST', 'cameraId is required');
      return;
    }

    const camera = await recordCameraHealth(cameraId, { status, safeErrorCode: safeErrorCode || message });
    if (!camera) {
      sendError(res, 404, 'NOT_FOUND', `Camera '${cameraId}' not found`);
      return;
    }

    sendSuccess(res, {
      acknowledged: true,
      cameraId: camera._id.toString(),
      status: camera.status,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to process AI health heartbeat');
  }
});

/**
 * GET /internal/v1/footfall/cameras
 * Lists cameras the AI worker should open a real video source for.
 * MOCK_STREAM is intentionally excluded — it has no real stream to open, it's pure UI-side DEMO.
 */
internalRouter.get('/cameras', async (_req: Request, res: Response) => {
  try {
    const cameras = await CameraModel.find({
      connectionType: { $in: Array.from(REAL_VIDEO_CONNECTION_TYPES) },
    });

    sendSuccess(
      res,
      cameras.map((c) => ({
        cameraId: c._id.toString(),
        shopId: c.shopId.toString(),
        name: c.name,
        connectionType: c.connectionType,
        status: c.status,
      }))
    );
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to list cameras');
  }
});

/**
 * GET /internal/v1/footfall/cameras/:cameraId/stream-config
 * Returns the DECRYPTED stream URL and counting-line config for the AI worker to connect with.
 * Internal/service-auth only — this is the one legitimate consumer of raw credentials;
 * owner/admin-facing endpoints never return this (see Camera.toResponseObject()).
 */
internalRouter.get('/cameras/:cameraId/stream-config', async (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const camera = await CameraModel.findById(cameraId);
    if (!camera) {
      sendError(res, 404, 'NOT_FOUND', `Camera '${cameraId}' not found`);
      return;
    }

    if (!REAL_VIDEO_CONNECTION_TYPES.has(camera.connectionType)) {
      sendError(res, 400, 'BAD_REQUEST', `Camera connectionType '${camera.connectionType}' has no real stream to open`);
      return;
    }

    const streamUrl = tryResolveDecryptedStreamUrl(camera);
    if (streamUrl === null) {
      sendError(res, 422, 'CAMERA_SECRET_UNREADABLE', 'Stored camera URL cannot be decrypted (encryption key changed?). Re-enter the camera URL in the owner panel.');
      return;
    }

    const [countingLine, zone] = await Promise.all([
      CountingLineModel.findOne({ cameraId: camera._id }),
      ZoneModel.findOne({ cameraId: camera._id }),
    ]);

    sendSuccess(res, {
      cameraId: camera._id.toString(),
      shopId: camera.shopId.toString(),
      connectionType: camera.connectionType,
      streamUrl,
      countingLine: countingLine
        ? {
            coordinates: countingLine.coordinates,
            inDirection: countingLine.inDirection,
            outDirection: countingLine.outDirection,
            enabled: countingLine.enabled,
          }
        : null,
      zone: zone
        ? {
            zoneType: zone.zoneType,
            polygon: zone.polygon,
            sensitivity: zone.sensitivity,
            enabled: zone.enabled,
          }
        : null,
      ignoreRegions: camera.ignoreRegions || [],
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to resolve stream config');
  }
});
