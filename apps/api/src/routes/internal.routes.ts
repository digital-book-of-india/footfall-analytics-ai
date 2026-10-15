import { Router, Request, Response } from 'express';
import { requireAiServiceSecret } from '../middleware/aiAuth.js';
import { FootfallEventModel } from '../models/FootfallEvent.js';
import { CameraModel } from '../models/Camera.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { 
  IngestFootfallEventRequest, 
  IngestEventResponseData, 
  AIHeartbeatRequest 
} from '@dbi/shared-types';

export const internalRouter = Router();

// Apply AI service secret auth to all internal routes
internalRouter.use(requireAiServiceSecret);

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
