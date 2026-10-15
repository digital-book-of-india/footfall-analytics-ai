import { Response } from 'express';
import { ApiResponse, ApiError, ErrorCode } from '@dbi/shared-types';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  const requestId = (res.req as any).requestId || 'req_auto_' + Math.random().toString(36).substring(2, 9);
  const body: ApiResponse<T> = {
    success: true,
    data,
    requestId,
  };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: ErrorCode | string,
  message: string,
  details?: unknown
): Response {
  const requestId = (res.req as any).requestId || 'req_auto_' + Math.random().toString(36).substring(2, 9);
  const body: ApiError = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    requestId,
  };
  return res.status(statusCode).json(body);
}
