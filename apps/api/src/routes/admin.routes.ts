import { Router, Response } from 'express';
import { UserModel } from '../models/User.js';
import { ShopModel } from '../models/Shop.js';
import { CameraModel } from '../models/Camera.js';
import { FootfallEventModel } from '../models/FootfallEvent.js';
import { AuditLogModel } from '../models/AuditLog.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { 
  AdminOverviewResponseData, 
  AdminShopItem, 
  AdminCameraHealthItem, 
  UpdateShopStatusRequest, 
  Shop, 
  AuditLog, 
  PaginatedResult 
} from '@dbi/shared-types';

export const adminRouter = Router();

// Enforce authentication & SUPER_ADMIN role for all admin routes
adminRouter.use(requireAuth);
adminRouter.use(requireRole('SUPER_ADMIN'));

/**
 * GET /api/v1/admin/overview
 * Platform-wide KPI overview metrics
 */
adminRouter.get('/overview', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const totalShops = await ShopModel.countDocuments();
    const activeShops = await ShopModel.countDocuments({ status: 'ACTIVE' });
    const suspendedShops = await ShopModel.countDocuments({ status: 'SUSPENDED' });
    const totalOwners = await UserModel.countDocuments({ role: 'SHOP_OWNER' });
    const totalCameras = await CameraModel.countDocuments();
    const onlineCameras = await CameraModel.countDocuments({ status: 'ONLINE' });

    // Today's total platform-wide footfall
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const todayEvents = await FootfallEventModel.aggregate([
      { $match: { occurredAt: { $gte: todayStart } } },
      { $group: { _id: '$direction', count: { $sum: 1 } } },
    ]);

    let totalEntriesToday = 0;
    let totalExitsToday = 0;
    for (const item of todayEvents) {
      if (item._id === 'IN') totalEntriesToday = item.count;
      if (item._id === 'OUT') totalExitsToday = item.count;
    }

    const currentEstimatedOccupancy = Math.max(0, totalEntriesToday - totalExitsToday);

    const overviewData: AdminOverviewResponseData = {
      totalShops,
      activeShops,
      suspendedShops,
      totalOwners,
      totalCameras,
      onlineCameras,
      totalEntriesToday,
      totalExitsToday,
      currentEstimatedOccupancy,
    };

    sendSuccess<AdminOverviewResponseData>(res, overviewData);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch admin overview');
  }
});

/**
 * GET /api/v1/admin/owners
 * List registered shop owners
 */
adminRouter.get('/owners', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const owners = await UserModel.find({ role: 'SHOP_OWNER' }).sort({ createdAt: -1 });

    const ownerList = await Promise.all(
      owners.map(async (u) => {
        const shopCount = await ShopModel.countDocuments({ ownerUserId: u._id });
        return {
          id: u._id.toString(),
          name: u.name,
          email: u.email,
          status: u.status,
          shopCount,
          createdAt: u.createdAt.toISOString(),
        };
      })
    );

    sendSuccess(res, ownerList);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch owners list');
  }
});

/**
 * GET /api/v1/admin/shops
 * List all shops with owner details, camera counts, and current footfall
 */
adminRouter.get('/shops', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const shops = await ShopModel.find().populate('ownerUserId').sort({ createdAt: -1 });
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const items: AdminShopItem[] = await Promise.all(
      shops.map(async (s) => {
        const cameraCount = await CameraModel.countDocuments({ shopId: s._id });
        const events = await FootfallEventModel.aggregate([
          { $match: { shopId: s._id, occurredAt: { $gte: todayStart } } },
          { $group: { _id: '$direction', count: { $sum: 1 } } },
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
          id: s._id.toString(),
          name: s.name,
          status: s.status,
          timezone: s.timezone,
          owner: {
            id: ownerDoc?._id?.toString() || '',
            name: ownerDoc?.name || 'Unknown',
            email: ownerDoc?.email || '',
          },
          cameraCount,
          todayEntries,
          todayExits,
          currentOccupancy,
          createdAt: s.createdAt.toISOString(),
        };
      })
    );

    sendSuccess<AdminShopItem[]>(res, items);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch admin shops list');
  }
});

/**
 * PATCH /api/v1/admin/shops/:shopId/status
 * Activate or suspend shop with mandatory reason and audit logging
 */
adminRouter.patch('/shops/:shopId/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { shopId } = req.params;
    const { status, reason } = req.body as UpdateShopStatusRequest;

    if (!status || (status !== 'ACTIVE' && status !== 'SUSPENDED')) {
      sendError(res, 400, 'BAD_REQUEST', "Valid status ('ACTIVE' or 'SUSPENDED') is required");
      return;
    }

    if (!reason || reason.trim().length === 0) {
      sendError(res, 400, 'BAD_REQUEST', 'An audited reason is mandatory when changing shop status');
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

    sendSuccess<Shop>(res, shop.toResponseObject());
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to update shop status');
  }
});

/**
 * GET /api/v1/admin/cameras/health
 * List all cameras across system with health & connection statuses
 */
adminRouter.get('/cameras/health', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const cameras = await CameraModel.find().populate('shopId').sort({ lastHeartbeatAt: -1 });

    const items: AdminCameraHealthItem[] = cameras.map((c) => {
      const shopDoc = c.shopId as any;
      return {
        cameraId: c._id.toString(),
        cameraName: c.name,
        shopId: shopDoc?._id?.toString() || '',
        shopName: shopDoc?.name || 'Unknown',
        status: c.status,
        connectionType: c.connectionType,
        lastHeartbeatAt: c.lastHeartbeatAt ? c.lastHeartbeatAt.toISOString() : undefined,
        safeErrorCode: c.safeErrorCode,
      };
    });

    sendSuccess<AdminCameraHealthItem[]>(res, items);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch camera health list');
  }
});

/**
 * GET /api/v1/admin/audit-logs
 * List audit logs with pagination
 */
adminRouter.get('/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || '20', 10)));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLogModel.countDocuments(),
    ]);

    const result: PaginatedResult<AuditLog> = {
      items: logs.map((l) => l.toResponseObject()),
      total,
      page,
      limit,
      hasMore: skip + logs.length < total,
    };

    sendSuccess<PaginatedResult<AuditLog>>(res, result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch audit logs');
  }
});
