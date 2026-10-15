import { Router, Response } from 'express';
import { ShopModel } from '../models/Shop.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { requireAuth, requireShopAccess, AuthenticatedRequest } from '../middleware/auth.js';
import { 
  CreateShopRequest, 
  UpdateShopRequest, 
  Shop 
} from '@dbi/shared-types';

export const shopRouter = Router();

/**
 * POST /api/v1/shops
 * Create a new shop associated with current authenticated user
 */
shopRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, timezone, occupancyBaseline } = req.body as CreateShopRequest;

    if (!name || name.trim().length === 0) {
      sendError(res, 400, 'BAD_REQUEST', 'Shop name is required');
      return;
    }

    const shop = await ShopModel.create({
      ownerUserId: req.user!._id,
      name: name.trim(),
      timezone: timezone || 'Asia/Kolkata',
      occupancyBaseline: typeof occupancyBaseline === 'number' ? occupancyBaseline : 0,
      status: 'ACTIVE',
    });

    sendSuccess<Shop>(res, shop.toResponseObject(), 201);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to create shop');
  }
});

/**
 * GET /api/v1/shops
 * List shops (Owners see only their own; Admins see all)
 */
shopRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query: any = {};

    // Tenant isolation: If not SUPER_ADMIN, strictly restrict to owner's shops
    if (req.user!.role !== 'SUPER_ADMIN') {
      query.ownerUserId = req.user!._id;
    } else if (req.query.ownerUserId) {
      query.ownerUserId = req.query.ownerUserId;
    }

    const shops = await ShopModel.find(query).sort({ createdAt: -1 });
    const responseData = shops.map((s) => s.toResponseObject());

    sendSuccess<Shop[]>(res, responseData);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to fetch shops');
  }
});

/**
 * GET /api/v1/shops/:shopId
 * Get specific shop details (Guarded by requireShopAccess)
 */
shopRouter.get('/:shopId', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  sendSuccess<Shop>(res, req.shop!.toResponseObject());
});

/**
 * PATCH /api/v1/shops/:shopId
 * Update shop details (Guarded by requireShopAccess)
 */
shopRouter.patch('/:shopId', requireAuth, requireShopAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, timezone, occupancyBaseline } = req.body as UpdateShopRequest;
    const shop = req.shop!;

    if (name !== undefined) {
      if (name.trim().length === 0) {
        sendError(res, 400, 'BAD_REQUEST', 'Shop name cannot be empty');
        return;
      }
      shop.name = name.trim();
    }

    if (timezone !== undefined) {
      shop.timezone = timezone.trim();
    }

    if (typeof occupancyBaseline === 'number') {
      if (occupancyBaseline < 0) {
        sendError(res, 400, 'BAD_REQUEST', 'Occupancy baseline cannot be negative');
        return;
      }
      shop.occupancyBaseline = occupancyBaseline;
    }

    await shop.save();
    sendSuccess<Shop>(res, shop.toResponseObject());
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to update shop');
  }
});
