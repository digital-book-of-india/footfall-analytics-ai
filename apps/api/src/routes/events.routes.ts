import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { SecurityEventModel } from '../models/SecurityEvent.js';
import { CameraModel } from '../models/Camera.js';
import { ShopModel } from '../models/Shop.js';
import { requireAuth, requireShopAccess, AuthenticatedRequest } from '../middleware/auth.js';
import { signEvidenceUrl } from '../services/evidence/signer.js';
import { removeEvidenceOf } from '../services/evidence/storage.js';
import { ReviewEventRequest, PaginatedEventsResponseData, SecurityEvent } from '@dbi/shared-types';
import { sendSuccess, sendError } from '../utils/response.js';

// Mounted at /api/v1/shops -> GET /:shopId/events, POST /:shopId/events/bulk-delete
export const shopEventsRouter = Router();
// Mounted at /api/v1/events -> GET /:eventId, DELETE /:eventId, POST /:eventId/review
export const eventRouter = Router();

/** Serializes a SecurityEvent with short-lived signed evidence URLs — never the raw object key. */
function formatEvent(e: any): SecurityEvent {
  const base = e.toResponseObject();
  const evidence: SecurityEvent['evidence'] = { ...base.evidence };

  if (e.evidence?.snapshotObjectKey) {
    const signed = signEvidenceUrl(e.eventId, 'snapshot');
    evidence.snapshotUrl = signed.url;
    evidence.expiresAt = signed.expiresAt;
  }
  if (e.evidence?.clipObjectKey) {
    const signed = signEvidenceUrl(e.eventId, 'clip');
    evidence.clipUrl = signed.url;
    evidence.expiresAt = signed.expiresAt;
  }

  return { ...base, evidence };
}

async function loadEventWithAccess(
  req: AuthenticatedRequest,
  res: Response
): Promise<InstanceType<typeof SecurityEventModel> | null> {
  const { eventId } = req.params;
  const isObjectId = Types.ObjectId.isValid(eventId);
  const query = isObjectId ? { $or: [{ eventId }, { _id: eventId }] } : { eventId };
  const event = await SecurityEventModel.findOne(query);
  if (!event) {
    sendError(res, 404, 'NOT_FOUND', 'Event not found');
    return null;
  }
  if (req.user!.role !== 'SUPER_ADMIN') {
    const shop = await ShopModel.findById(event.shopId).select('ownerUserId');
    if (!shop || shop.ownerUserId.toString() !== req.user!._id.toString()) {
      sendError(res, 403, 'FORBIDDEN', 'You do not have access to this event');
      return null;
    }
  }
  return event;
}

/**
 * GET /api/v1/shops/:shopId/events
 * Cursor-paginated (newest first), optionally filtered by eventType.
 */
shopEventsRouter.get('/:shopId/events', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    const query: Record<string, unknown> = { shopId: req.shop!._id };
    if (req.query.eventType) query.eventType = req.query.eventType;
    if (req.query.cursor) query.startedAt = { $lt: new Date(String(req.query.cursor)) };

    const [items, total] = await Promise.all([
      SecurityEventModel.find(query).sort({ startedAt: -1 }).limit(limit + 1),
      SecurityEventModel.countDocuments({ shopId: req.shop!._id }),
    ]);

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? resultItems[resultItems.length - 1].startedAt.toISOString() : null;

    sendSuccess<PaginatedEventsResponseData>(res, {
      items: resultItems.map(formatEvent) as PaginatedEventsResponseData['items'],
      nextCursor,
      total,
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to list events');
  }
});

/**
 * POST /api/v1/shops/:shopId/events/bulk-delete
 * Body: { ids: string[] } or { all: true, reviewStatus?, eventType? }
 */
shopEventsRouter.post(
  '/:shopId/events/bulk-delete',
  requireAuth,
  requireShopAccess,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.body?.all === true) {
        const filter: Record<string, unknown> = { shopId: req.shop!._id };
        const { reviewStatus, eventType } = req.body;
        if (reviewStatus !== undefined) {
          if (!['NEW', 'REVIEWED', 'FALSE_ALARM', 'CONFIRMED'].includes(reviewStatus)) {
            sendError(res, 400, 'BAD_REQUEST', 'Invalid review status');
            return;
          }
          filter.reviewStatus = reviewStatus;
        }
        if (eventType !== undefined) {
          if (typeof eventType !== 'string') {
            sendError(res, 400, 'BAD_REQUEST', 'Invalid event type');
            return;
          }
          filter.eventType = eventType;
        }
        const doomed = await SecurityEventModel.find(filter).select('evidence');
        const result = await SecurityEventModel.deleteMany(filter);
        doomed.forEach((e) => removeEvidenceOf(e.evidence));
        sendSuccess(res, { deleted: result.deletedCount });
        return;
      }

      const ids: unknown = req.body?.ids;
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > 200 ||
        !ids.every((id) => typeof id === 'string' && Types.ObjectId.isValid(id))
      ) {
        sendError(res, 400, 'BAD_REQUEST', 'Send between 1 and 200 event ids');
        return;
      }

      const match = { shopId: req.shop!._id, _id: { $in: ids } };
      const doomed = await SecurityEventModel.find(match).select('evidence');
      const result = await SecurityEventModel.deleteMany(match);
      doomed.forEach((e) => removeEvidenceOf(e.evidence));
      sendSuccess(res, { deleted: result.deletedCount });
    } catch (err: any) {
      sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to delete events');
    }
  }
);

/**
 * GET /api/v1/events/:eventId
 */
eventRouter.get('/:eventId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const event = await loadEventWithAccess(req, res);
    if (!event) return;
    sendSuccess(res, { event: formatEvent(event) });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch event');
  }
});

/**
 * DELETE /api/v1/events/:eventId
 */
eventRouter.delete('/:eventId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const event = await loadEventWithAccess(req, res);
    if (!event) return;
    const eventId = event.eventId;
    await event.deleteOne();
    removeEvidenceOf(event.evidence);
    sendSuccess(res, { id: eventId, message: 'Event deleted successfully' });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to delete event');
  }
});

/**
 * POST /api/v1/events/:eventId/review
 * Body: { reviewStatus: "REVIEWED" | "FALSE_ALARM" | "CONFIRMED" }
 * Marking FALSE_ALARM teaches the AI worker to skip that spot on this camera (ignoreRegions);
 * any other verdict takes that back.
 */
eventRouter.post('/:eventId/review', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reviewStatus } = req.body as ReviewEventRequest;
    if (!['REVIEWED', 'FALSE_ALARM', 'CONFIRMED'].includes(reviewStatus)) {
      sendError(res, 400, 'BAD_REQUEST', 'reviewStatus must be REVIEWED, FALSE_ALARM, or CONFIRMED');
      return;
    }

    const event = await loadEventWithAccess(req, res);
    if (!event) return;

    event.reviewStatus = reviewStatus;
    await event.save();

    await CameraModel.updateOne({ _id: event.cameraId }, { $pull: { ignoreRegions: { eventId: event.eventId } } });
    if (reviewStatus === 'FALSE_ALARM' && event.region) {
      await CameraModel.updateOne(
        { _id: event.cameraId },
        {
          $push: {
            ignoreRegions: {
              $each: [{ eventId: event.eventId, x: event.region.x, y: event.region.y, w: event.region.w, h: event.region.h }],
              $slice: -20,
            },
          },
        }
      );
    }

    sendSuccess(res, { event: formatEvent(event) });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to review event');
  }
});
