import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { shopRouter } from './shop.routes.js';
import { cameraRouter } from './camera.routes.js';
import { analyticsRouter } from './analytics.routes.js';
import { adminRouter } from './admin.routes.js';
import { sendSuccess } from '../utils/response.js';

export const apiV1Router = Router();

// Health check endpoint
apiV1Router.get('/health', (_req, res) => {
  sendSuccess(res, { status: 'healthy', timestamp: new Date().toISOString() });
});

// Route modules
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/shops', shopRouter);
apiV1Router.use('/', cameraRouter);
apiV1Router.use('/', analyticsRouter);
apiV1Router.use('/admin', adminRouter);
