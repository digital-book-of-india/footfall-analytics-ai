import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { apiV1Router } from './routes/index.js';
import { internalRouter } from './routes/internal.routes.js';
import { sendError } from './utils/response.js';

export const app = express();

// Enable CORS
app.use(cors({
  origin: '*', // Allow frontend dev origins
  credentials: true,
}));

// Parse JSON request bodies
app.use(express.json());

// Request tracking and correlation ID middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const incomingId = req.headers['x-request-id'] as string;
  (req as any).requestId = incomingId || `req_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  next();
});

// Mount API v1 router
app.use('/api/v1', apiV1Router);

// Mount Internal AI v1 router
app.use('/internal/v1/footfall', internalRouter);

// 404 Not Found Handler
app.use((req: Request, res: Response) => {
  sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`);
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Error]', err);
  sendError(
    res,
    err.status || 500,
    err.code || 'INTERNAL_ERROR',
    err.message || 'Internal server error'
  );
});
