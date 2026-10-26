import dotenv from 'dotenv';
import path from 'path';

// Load .env if present
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/dbi_footfall',
  jwtSecret: process.env.JWT_ACCESS_SECRET || 'dbi_footfall_jwt_secret_dev_key_2026',
  jwtExpiresIn: '7d',
  cameraEncryptionKey: process.env.CAMERA_SECRET_ENCRYPTION_KEY || 'dbi_camera_secret_key_32bytes!',
  aiSharedSecret: process.env.AI_SERVICE_SHARED_SECRET || 'dbi_ai_service_shared_secret_2026',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  connectorDownloadsDir: process.env.CONNECTOR_DOWNLOADS_DIR || path.resolve(process.cwd(), 'downloads/connector'),
  cameraHeartbeatTimeoutSec: parseInt(process.env.CAMERA_HEARTBEAT_TIMEOUT_SEC || '90', 10),
};
