import { Router, Request, Response } from 'express';
import { SecurityEventModel } from '../models/SecurityEvent.js';
import { verifyEvidenceToken } from '../services/evidence/signer.js';
import { safeResolve } from '../services/evidence/storage.js';
import { sendError } from '../utils/response.js';

// Mounted at /api/v1/evidence -> GET /:eventId/:kind?token=...
export const evidenceRouter = Router();

/**
 * GET /api/v1/evidence/:eventId/:kind
 * Serves a zone-watch alert's snapshot/clip file. Auth is the short-lived signed `token` query
 * param (see services/evidence/signer.ts) — not a session cookie — so the <img>/<video> tag's
 * `src` can be used directly without a custom fetch + blob dance in the owner app.
 */
evidenceRouter.get('/:eventId/:kind', async (req: Request, res: Response) => {
  try {
    const { eventId, kind } = req.params;
    if (kind !== 'snapshot' && kind !== 'clip') {
      sendError(res, 400, 'BAD_REQUEST', 'kind must be snapshot or clip');
      return;
    }

    const token = req.query.token as string | undefined;
    if (!token) {
      sendError(res, 401, 'UNAUTHORIZED', 'A signed token is required');
      return;
    }
    const payload = verifyEvidenceToken(token);
    if (!payload || payload.eventId !== eventId || payload.kind !== kind) {
      sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired evidence link');
      return;
    }

    const event = await SecurityEventModel.findOne({ eventId });
    if (!event) {
      sendError(res, 404, 'NOT_FOUND', 'Event not found');
      return;
    }

    const objectKey = kind === 'snapshot' ? event.evidence?.snapshotObjectKey : event.evidence?.clipObjectKey;
    const filePath = objectKey ? safeResolve(objectKey) : null;
    if (!filePath) {
      sendError(res, 404, 'NOT_FOUND', 'No evidence file for this event');
      return;
    }

    res.set('Cache-Control', 'private, no-store');
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        sendError(res, 404, 'NOT_FOUND', 'Evidence file not found on disk');
      }
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch evidence');
  }
});
