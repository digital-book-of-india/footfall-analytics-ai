import { Request, Response } from 'express';
import { 
  fetchPlatformOverview, 
  fetchShopsDirectory, 
  fetchMerchantsDirectory, 
  executeAtomicStatusUpdate, 
  fetchCameraFleetHealth, 
  fetchAuditLogsTimeline 
} from './admin.service';
import { isValidObjectId, validateStatusUpdateInput } from './admin.validation';

export interface AuthenticatedAdminRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  requestId?: string;
}

export async function getOverviewHandler(req: AuthenticatedAdminRequest, res: Response) {
  try {
    const data = await fetchPlatformOverview();
    return res.json({ success: true, data, requestId: req.requestId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message }, requestId: req.requestId });
  }
}

export async function getShopsHandler(req: AuthenticatedAdminRequest, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const status = req.query.status as string;
    const search = (req.query.search as string || '').trim();

    const data = await fetchShopsDirectory(page, limit, status, search);
    return res.json({ success: true, data, requestId: req.requestId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message }, requestId: req.requestId });
  }
}

export async function getOwnersHandler(req: AuthenticatedAdminRequest, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string || '').trim();

    const data = await fetchMerchantsDirectory(page, limit, search);
    return res.json({ success: true, data, requestId: req.requestId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message }, requestId: req.requestId });
  }
}

export async function patchShopStatusHandler(req: AuthenticatedAdminRequest, res: Response) {
  const { shopId } = req.params;
  const { status, reason } = req.body;

  if (!isValidObjectId(shopId)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Valid Shop ObjectId required' }, requestId: req.requestId });
  }

  const validation = validateStatusUpdateInput(status, reason);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_FAILED', message: validation.error }, requestId: req.requestId });
  }

  try {
    const data = await executeAtomicStatusUpdate(shopId, status, reason, req.user!.id, req.requestId!);
    return res.json({ success: true, data, requestId: req.requestId });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return res.status(status).json({ success: false, error: { code: err.code || 'UPDATE_FAILED', message: err.message }, requestId: req.requestId });
  }
}

export async function getCameraHealthHandler(req: AuthenticatedAdminRequest, res: Response) {
  try {
    const data = await fetchCameraFleetHealth();
    return res.json({ success: true, data, requestId: req.requestId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message }, requestId: req.requestId });
  }
}

export async function getAuditLogsHandler(req: AuthenticatedAdminRequest, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    const data = await fetchAuditLogsTimeline(page, limit);
    return res.json({ success: true, data, requestId: req.requestId });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message }, requestId: req.requestId });
  }
}
