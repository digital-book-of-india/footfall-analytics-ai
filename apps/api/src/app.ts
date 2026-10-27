import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { apiV1Router } from './routes/index.js';
import { internalRouter } from './routes/internal.routes.js';
import { connectorPairingRouter, connectorDeviceRouter } from './routes/internalConnector.routes.js';
import { sendError } from './utils/response.js';

export const app = express();

// Enable CORS for the owner/admin web apps (and configured dev origins)
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header) and whitelisted origins
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
}));

// A DISCOVER channel-scan result can carry up to 32 base64 JPEG thumbnails - well past
// the default ~100kb body limit. Must be registered before the general json() below,
// since the first body parser to run consumes the request stream.
app.use('/internal/v1/connectors/jobs/:jobId/result', express.json({ limit: '4mb' }));

// Parse JSON request bodies
app.use(express.json());

// Request tracking and correlation ID middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const incomingId = req.headers['x-request-id'] as string;
  (req as any).requestId = incomingId || `req_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  next();
});

// Public connector installer + electron-updater feed (latest.yml, Setup.exe, .blockmap).
// Files are uploaded here by the connector release workflow; the .exe link never changes.
app.use('/downloads/connector', express.static(config.connectorDownloadsDir, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.yml')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Mount API v1 router
app.use('/api/v1', apiV1Router);

// Mount Internal AI v1 router
app.use('/internal/v1/footfall', internalRouter);

// Mount Internal Connector v1 routers (pairing is unauthenticated; device calls require connectorAuth)
app.use('/internal/v1/connectors', connectorPairingRouter);
app.use('/internal/v1/connectors', connectorDeviceRouter);

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
