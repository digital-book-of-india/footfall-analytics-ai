import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { sendError } from '../utils/response.js';

/**
 * Middleware: Verify AI Service Shared Secret for internal service-to-service endpoints
 * Checks 'x-ai-secret' or 'authorization' bearer against configured secret
 */
export function requireAiServiceSecret(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const secretHeader = req.headers['x-ai-secret'] as string | undefined;
  const authHeader = req.headers['authorization'];

  let providedSecret = secretHeader;
  if (!providedSecret && authHeader && authHeader.startsWith('Bearer ')) {
    providedSecret = authHeader.split(' ')[1];
  }

  if (!providedSecret) {
    sendError(res, 401, 'UNAUTHORIZED', 'Missing internal service authentication key (x-ai-secret)');
    return;
  }

  if (providedSecret !== config.aiSharedSecret) {
    sendError(res, 403, 'FORBIDDEN', 'Invalid internal service authentication credentials');
    return;
  }

  next();
}
