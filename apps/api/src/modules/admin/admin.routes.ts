import { Router, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { 
  getOverviewHandler, 
  getShopsHandler, 
  getOwnersHandler, 
  patchShopStatusHandler, 
  getCameraHealthHandler, 
  getAuditLogsHandler,
  AuthenticatedAdminRequest 
} from './admin.controller';

export const adminRouter = Router();

const requireSuperAdminGuard = (req: AuthenticatedAdminRequest, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  req.requestId = reqId;
  res.setHeader('x-request-id', reqId);

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token required' }, requestId: reqId });
  }

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    return res.status(500).json({ success: false, error: { code: 'MISCONFIGURED', message: 'JWT Secret missing' }, requestId: reqId });
  }

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], secret) as any;
    if (decoded.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Super Admin access required' }, requestId: reqId });
    }
    req.user = { id: decoded.id || decoded.sub, email: decoded.email, role: decoded.role };
    next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Session expired' }, requestId: reqId });
  }
};

adminRouter.use(requireSuperAdminGuard);

adminRouter.get('/overview', getOverviewHandler);
adminRouter.get('/shops', getShopsHandler);
adminRouter.get('/owners', getOwnersHandler);
adminRouter.patch('/shops/:shopId/status', patchShopStatusHandler);
adminRouter.get('/cameras/health', getCameraHealthHandler);
adminRouter.get('/audit-logs', getAuditLogsHandler);
