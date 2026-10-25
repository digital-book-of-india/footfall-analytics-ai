import { Request, Response, NextFunction } from 'express';

/**
 * In-memory per-IP rate limiter — ported from the sibling theaft-ai project's
 * middleware/rateLimiter.ts (generic, no theft-specific logic). footfall-analytics-ai
 * previously had NO brute-force protection at all on login/register or admin routes.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export function createRateLimiter(options: { windowMs?: number; maxRequests?: number; message?: string }) {
  const windowMs = options.windowMs ?? 60 * 1000;
  const maxRequests = options.maxRequests ?? 20;
  const message = options.message ?? 'Too many requests. Please try again later.';

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown_ip';

    const key = `${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();

    if (rateLimitStore.size > 1000) {
      for (const [k, v] of rateLimitStore.entries()) {
        if (now > v.resetAt) rateLimitStore.delete(k);
      }
    }

    const current = rateLimitStore.get(key);
    if (!current || now > current.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message },
        requestId: (req as any).requestId,
      });
      return;
    }

    next();
  };
}

/** 20 attempts/min per IP on login & register — the exact limit theaft-ai uses for auth. */
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Too many authentication attempts. Please try again in a minute.',
});

/** 100 requests/min per IP on the admin API surface — matches theaft-ai's admin rate limit. */
export const adminRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  message: 'Too many requests to admin services. Try again in 60 seconds.',
});
