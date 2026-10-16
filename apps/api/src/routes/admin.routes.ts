import { Router, Response } from 'express';
import { UserModel } from '../models/User.js';
import { ShopModel } from '../models/Shop.js';
import { CameraModel } from '../models/Camera.js';
import { FootfallEventModel } from '../models/FootfallEvent.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { 
  UpdateShopStatusRequest, 
  Shop 
} from '@dbi/shared-types';

export const adminRouter = Router();

// Enforce authentication & SUPER_ADMIN role for all admin routes
adminRouter.use(requireAuth);
adminRouter.use(requireRole('SUPER_ADMIN'));

/**
 * Dynamic evaluator to ensure stale heartbeats (>90s) never show as ONLINE
 */
function evaluateCameraStatus(status: string, lastHeartbeatAt: Date | string | null | undefined): string {
  if (!lastHeartbeatAt) {
    return status === 'CONFIG_ERROR' ? 'CONFIG_ERROR' : 'NEEDS_SETUP';
  }
  const diffMs = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (diffMs > 90000) {
    return 'OFFLINE';
  }
  return status;
}

/**
 * GET /api/v1/admin/overview
 * Platform-wide KPI overview metrics + Worker health
 */
adminRouter.get('/overview', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const totalShops = await ShopModel.countDocuments();
    const activeShops = await ShopModel.countDocuments({ status: 'ACTIVE' });
    const suspendedShops = await ShopModel.countDocuments({ status: 'SUSPENDED' });
    const totalOwners = await UserModel.countDocuments({ role: 'SHOP_OWNER' });
    
    const allCameras = await CameraModel.find();
    const totalCameras = allCameras.length;

    let onlineCameras = 0;
    let degradedCameras = 0;
    let offlineCameras = 0;

    for (const cam of allCameras) {
      const evaluated = evaluateCameraStatus(cam.status, cam.lastHeartbeatAt);
      if (evaluated === 'ONLINE') onlineCameras++;
      else if (evaluated === 'DEGRADED' || evaluated === 'CONFIG_ERROR') degradedCameras++;
      else offlineCameras++;
    }

    // Latest camera heartbeat
    const latestCam = await CameraModel.findOne({ lastHeartbeatAt: { $ne: null } }).sort({ lastHeartbeatAt: -1 });
    const now = Date.now();
    const isWorkerOnline = Boolean(
      totalCameras > 0 &&
      latestCam?.lastHeartbeatAt &&
      now - new Date(latestCam.lastHeartbeatAt).getTime() <= 90000
    );

    // Today's total platform-wide footfall
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const todayEvents = await FootfallEventModel.aggregate([
      { $match: { occurredAt: {$gte: todayStart } } },
      { $group: { _id: '$direction', count: {$sum: 1 } } },
    ]);

    let totalEntriesToday = 0;
    let totalExitsToday = 0;
    for (const item of todayEvents) {
      if (item._id === 'IN') totalEntriesToday = item.count;
      if (item._id === 'OUT') totalExitsToday = item.count;
    }

    const currentEstimatedOccupancy = Math.max(0, totalEntriesToday - totalExitsToday);

    const overviewData = {
      totalShops,
      activeShops,
      suspendedShops,
      totalOwners,
      totalCameras,
      onlineCameras,
      degradedCameras,
      offlineCameras,
      totalEntriesToday,
      totalExitsToday,
      currentEstimatedOccupancy,
      workerHealth: {
        status: isWorkerOnline ? 'ONLINE' : totalCameras > 0 ? 'OFFLINE' : 'NEEDS_SETUP',
        lastHeartbeatAt: latestCam?.lastHeartbeatAt ? latestCam.lastHeartbeatAt.toISOString() : null,
      },
    };

    sendSuccess(res, overviewData);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch admin overview');
  }
});

/**
 * GET /api/v1/admin/owners
 */
adminRouter.get('/owners', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const search = ((req.query.search as string) || (req.query.q as string) || '').trim();

    const filter: any = { role: 'SHOP_OWNER' };
    if (search) {
      filter.$or = [
        { name: { $regex: search,$options: 'i' } },
        { email: { $regex: search,$options: 'i' } },
      ];
    }

    const total = await UserModel.countDocuments(filter);
    const owners = await UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const items = await Promise.all(
      owners.map(async (u) => {
        const shopsCount = await ShopModel.countDocuments({ ownerUserId: u._id });
        return {
          _id: u._id.toString(),
          id: u._id.toString(),
          name: u.name,
          email: u.email,
          status: u.status,
          shopsCount,
          shopCount: shopsCount,
          createdAt: u.createdAt.toISOString(),
        };
      })
    );

    sendSuccess(res, {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch owners list');
  }
});

/**
 * GET /api/v1/admin/shops
 */
adminRouter.get('/shops', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const status = req.query.status as string;
    const search = ((req.query.search as string) || (req.query.q as string) || '').trim();

    const filter: any = {};
    if (status && status !== 'ALL') {
      filter.status = status;
    }
    if (search) {
      filter.name = { $regex: search,$options: 'i' };
    }

    const total = await ShopModel.countDocuments(filter);
    const shops = await ShopModel.find(filter)
      .populate('ownerUserId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const items = await Promise.all(
      shops.map(async (s) => {
        const cameraCount = await CameraModel.countDocuments({ shopId: s._id });
        const events = await FootfallEventModel.aggregate([
          { $match: { shopId: s._id, occurredAt: {$gte: todayStart } } },
          { $group: { _id: '$direction', count: {$sum: 1 } } },
        ]);

        let todayEntries = 0;
        let todayExits = 0;
        for (const e of events) {
          if (e._id === 'IN') todayEntries = e.count;
          if (e._id === 'OUT') todayExits = e.count;
        }

        const baseline = s.occupancyBaseline || 0;
        const currentOccupancy = Math.max(0, baseline + todayEntries - todayExits);
        const ownerDoc = s.ownerUserId as any;

        return {
          _id: s._id.toString(),
          id: s._id.toString(),
          name: s.name,
          status: s.status,
          timezone: s.timezone,
          ownerName: ownerDoc?.name || 'Unknown',
          ownerEmail: ownerDoc?.email || '',
          owner: {
            id: ownerDoc?._id?.toString() || '',
            name: ownerDoc?.name || 'Unknown',
            email: ownerDoc?.email || '',
          },
          cameraCount,
          todayEntries,
          todayExits,
          currentOccupancy,
          occupancy: currentOccupancy,
          createdAt: s.createdAt.toISOString(),
        };
      })
    );

    sendSuccess(res, {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch admin shops list');
  }
});

/**
 * PATCH /api/v1/admin/shops/:shopId/status
 * Enforce minimum 5 characters reason
 */
adminRouter.patch('/shops/:shopId/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { shopId } = req.params;
    const { status, reason } = req.body as UpdateShopStatusRequest;

    if (!status || (status !== 'ACTIVE' && status !== 'SUSPENDED')) {
      sendError(res, 400, 'BAD_REQUEST', "Valid status ('ACTIVE' or 'SUSPENDED') is required");
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      sendError(res, 400, 'BAD_REQUEST', 'An audited reason with a minimum of 5 characters is mandatory');
      return;
    }

    const shop = await ShopModel.findById(shopId);
    if (!shop) {
      sendError(res, 404, 'NOT_FOUND', `Shop '${shopId}' not found`);
      return;
    }

    const prevStatus = shop.status;
    shop.status = status;
    await shop.save();

    const action = status === 'SUSPENDED' ? 'SUSPEND_SHOP' : 'ACTIVATE_SHOP';
    const requestId = (req as any).requestId || 'req_auto';

    await AuditLogModel.create({
      actor: {
        userId: req.user!._id,
        email: req.user!.email,
        role: req.user!.role,
      },
      action,
      target: {
        type: 'SHOP',
        id: shop._id.toString(),
      },
      reason: `Status changed from ${prevStatus} to ${status}: ${reason.trim()}`,
      requestId,
    });

    const responseShop: any = shop.toResponseObject();
    responseShop._id = shop._id.toString();

    sendSuccess<Shop>(res, responseShop);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to update shop status');
  }
});

/**
 * GET /api/v1/admin/cameras/health
 * Dynamic status evaluation to prevent showing stale heartbeats as ONLINE
 */
adminRouter.get('/cameras/health', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const cameras = await CameraModel.find().populate('shopId').sort({ lastHeartbeatAt: -1 });

    const items = cameras.map((c) => {
      const shopDoc = c.shopId as any;
      const evaluated = evaluateCameraStatus(c.status, c.lastHeartbeatAt);
      return {
        _id: c._id.toString(),
        id: c._id.toString(),
        name: c.name,
        cameraName: c.name,
        shopId: shopDoc?._id?.toString() || '',
        shopName: shopDoc?.name || 'Unknown Shop',
        status: evaluated,
        connectionType: c.connectionType || 'RTSP',
        lastHeartbeatAt: c.lastHeartbeatAt ? c.lastHeartbeatAt.toISOString() : null,
        safeErrorCode: c.safeErrorCode || null,
      };
    });

    sendSuccess(res, {
      items,
      total: items.length,
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch camera health list');
  }
});

/**
 * GET /api/v1/admin/audit-logs
 */
adminRouter.get('/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit as string) || '20', 10)));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLogModel.countDocuments(),
    ]);

    const items = logs.map((l) => ({
      _id: l._id.toString(),
      id: l._id.toString(),
      createdAt: l.createdAt.toISOString(),
      requestId: l.requestId,
      actorEmail: l.actor.email,
      actor: l.actor,
      action: l.action,
      target: l.target,
      reason: l.reason || 'N/A',
      status: 'SUCCESS' as const,
    }));

    sendSuccess(res, {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      hasMore: skip + logs.length < total,
    });
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch audit logs');
  }
});
