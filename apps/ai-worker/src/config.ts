import dotenv from 'dotenv';

dotenv.config();

export const workerConfig = {
  apiBaseUrl: process.env.CORE_API_URL || 'http://localhost:4000',
  aiSharedSecret: process.env.AI_SERVICE_SHARED_SECRET || 'dbi_ai_service_shared_secret_2026',
  heartbeatIntervalSec: parseInt(process.env.HEARTBEAT_INTERVAL_SEC || '30', 10),
  modelVersion: 'yolo-crossing-v1.0',
};
