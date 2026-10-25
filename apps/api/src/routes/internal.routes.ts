import { Router, Request, Response } from 'express';
import { requireAiServiceSecret } from '../middleware/aiAuth.js';
import { FootfallEventModel } from '../models/FootfallEvent.js';
import { FootfallAggregateModel } from '../models/FootfallAggregate.js';
import { CameraModel } from '../models/Camera.js';
import { CountingLineModel } from '../models/CountingLine.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { resolveDecryptedStreamUrl } from '../utils/cameraStream.js';
import {
  IngestFootfallEventRequest,
  IngestEventResponseData,
  AIHeartbeatRequest
} from '@dbi/shared-types';

export const internalRouter = Router();

// Apply AI service secret auth to all internal routes
internalRouter.use(requireAiServiceSecret);

/** Connection types the AI worker can open a real video source for (never MOCK_STREAM, which is pure demo). */
const REAL_VIDEO_CONNECTION_TYPES = new Set(['RTSP', 'TEST_CLIP', 'HTTP_STREAM', 'WEBCAM']);

/** Floors a date to the start of its UTC hour, for hourly aggregate bucketing. */
function floorToHourUtc(date: Date): Date {
  const bucket = new Date(date);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket;
}

/** Increments (or creates) the hourly footfallAggregates bucket for a processed event. */
async function bumpHourlyAggregate(shopId: string, direction: 'IN' | 'OUT', occurredAt: Date): Promise<void> {
  const bucketStartUtc = floorToHourUtc(occurredAt);
  const inc = direction === 'IN' ? { entries: 1 } : { exits: 1 };
  await FootfallAggregateModel.findOneAndUpdate(
    { shopId, bucketStartUtc, bucketType: 'HOUR' },
    { $inc: inc, $setOnInsert: { quality: 'OK' } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * POST /internal/v1/footfall/events
 * Ingest high-frequency crossing events with strict deduplication / idempotency
 */
internalRouter.post('/events', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    let eventsToProcess: IngestFootfallEventRequest[] = [];

    if (Array.isArray(body)) {
      eventsToProcess = body;
    } else if (body.events && Array.isArray(body.events)) {
      eventsToProcess = body.events;
    } else if (body.eventId) {
      eventsToProcess = [body as IngestFootfallEventRequest];
    } else {
      sendError(res, 400, 'BAD_REQUEST', 'Request body must contain eventId or events array');
      return;
    }

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

    sendSuccess<IngestEventResponseData>(res, { processed, ignoredDuplicates });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to ingest footfall events');
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

    const camera = await CameraModel.findById(cameraId);
    if (!camera) {
      sendError(res, 404, 'NOT_FOUND', `Camera '${cameraId}' not found`);
      return;
    }

    camera.lastHeartbeatAt = new Date();
    if (status) {
      camera.status = status;
    }
    if (safeErrorCode || message) {
      camera.safeErrorCode = safeErrorCode || message;
    } else {
      camera.safeErrorCode = undefined;
    }

    await camera.save();

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

    const streamUrl = resolveDecryptedStreamUrl(camera);

    const countingLine = await CountingLineModel.findOne({ cameraId: camera._id });

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
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to resolve stream config');
  }
});
