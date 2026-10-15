import { Router, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { requireAuth, requireShopAccess, AuthenticatedRequest } from '../middleware/auth.js';
import { 
  FootfallSummaryResponseData, 
  FootfallTimeseriesResponseData, 
  SetOccupancyBaselineRequest 
} from '@dbi/shared-types';

export const analyticsRouter = Router();

/**
 * GET /api/v1/shops/:shopId/footfall/summary
 * Real-time footfall summary, live occupancy, quality indicator
 */
analyticsRouter.get('/shops/:shopId/footfall/summary', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateStr = req.query.date as string | undefined;
    const summary = await AnalyticsService.getSummary(req.shop!, dateStr);
    sendSuccess<FootfallSummaryResponseData>(res, summary);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch footfall summary');
  }
});

/**
 * GET /api/v1/shops/:shopId/footfall/timeseries
 * 24-hour hourly traffic data for charts
 */
analyticsRouter.get('/shops/:shopId/footfall/timeseries', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateStr = req.query.date as string | undefined;
    const timeseries = await AnalyticsService.getTimeseries(req.shop!, dateStr);
    sendSuccess<FootfallTimeseriesResponseData>(res, timeseries);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch footfall timeseries');
  }
});

/**
 * POST /api/v1/shops/:shopId/footfall/occupancy-baseline
 * Correct occupancy drift by updating baseline with audit logging
 */
analyticsRouter.post('/shops/:shopId/footfall/occupancy-baseline', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { baseline, reason } = req.body as SetOccupancyBaselineRequest;

    if (typeof baseline !== 'number' || baseline < 0) {
      sendError(res, 400, 'BAD_REQUEST', 'Baseline must be a non-negative number');
      return;
    }

    const previousBaseline = req.shop!.occupancyBaseline;
    req.shop!.occupancyBaseline = baseline;
    await req.shop!.save();

    // Create audit log for drift correction
    const requestId = (req as any).requestId || 'req_auto';
    await AuditLogModel.create({
      actor: {
        userId: req.user!._id,
        email: req.user!.email,
        role: req.user!.role,
      },
      action: 'UPDATE_OCCUPANCY_BASELINE',
      target: {
        type: 'SHOP',
        id: req.shop!._id.toString(),
      },
      reason: reason || `Manual occupancy baseline reset from ${previousBaseline} to ${baseline}`,
      requestId,
    });

    const updatedSummary = await AnalyticsService.getSummary(req.shop!);
    sendSuccess<FootfallSummaryResponseData>(res, updatedSummary);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to update occupancy baseline');
  }
});

/**
 * GET /api/v1/shops/:shopId/footfall/export.csv
 * Download CSV report
 */
analyticsRouter.get('/shops/:shopId/footfall/export.csv', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateStr = req.query.date as string | undefined;
    const csvData = await AnalyticsService.generateCsv(req.shop!, dateStr);
    const dateFormatted = dateStr || new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="footfall-${req.shop!._id}-${dateFormatted}.csv"`);
    res.status(200).send(csvData);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to export footfall CSV');
  }
});
