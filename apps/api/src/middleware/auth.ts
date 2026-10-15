import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UserModel, IUserDocument } from '../models/User.js';
import { ShopModel, IShopDocument } from '../models/Shop.js';
import { sendError } from '../utils/response.js';
import { Role } from '@dbi/shared-types';

export interface AuthenticatedRequest extends Request {
  user?: IUserDocument;
  shop?: IShopDocument;
  requestId?: string;
}

interface JwtPayload {
  userId: string;
  role: Role;
  email: string;
}

/**
 * Middleware: Verify Bearer JWT Token
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid Authorization header');
      return;
    }

    const token = authHeader.split(' ')[1];
    let decoded: JwtPayload;

    try {
      decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    } catch (jwtErr) {
      sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired authentication token');
      return;
    }

    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      sendError(res, 401, 'UNAUTHORIZED', 'User associated with token no longer exists');
      return;
    }

    if (user.status === 'SUSPENDED') {
      sendError(res, 403, 'FORBIDDEN', 'User account is suspended');
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal authentication error');
  }
}

/**
 * Middleware: Role-Based Access Control Guard
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(
        res,
        403,
        'FORBIDDEN',
        `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`
      );
      return;
    }

    next();
  };
}

/**
 * Middleware: Multi-Tenant Shop Access Guard
 * Enforces strict tenant isolation:
 * - SUPER_ADMIN can access any shop.
 * - SHOP_OWNER can only access shops they own.
 * - Violations result in 403 FORBIDDEN with TENANT_VIOLATION.
 */
export async function requireShopAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }

    const shopId = req.params.shopId || req.body?.shopId;
    if (!shopId) {
      sendError(res, 400, 'BAD_REQUEST', 'Shop ID parameter is required');
      return;
    }

    const shop = await ShopModel.findById(shopId);
    if (!shop) {
      sendError(res, 404, 'NOT_FOUND', `Shop with id '${shopId}' not found`);
      return;
    }

    // Tenant check
    if (req.user.role !== 'SUPER_ADMIN' && shop.ownerUserId.toString() !== req.user._id.toString()) {
      sendError(
        res,
        403,
        'TENANT_VIOLATION',
        'Access denied: You do not have permission to view or manage this shop'
      );
      return;
    }

    // Check if shop is suspended (Super Admin can still access suspended shops)
    if (shop.status === 'SUSPENDED' && req.user.role !== 'SUPER_ADMIN') {
      sendError(res, 403, 'FORBIDDEN', 'This shop is suspended. Please contact administrator.');
      return;
    }

    req.shop = shop;
    next();
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal error verifying shop access');
  }
}
