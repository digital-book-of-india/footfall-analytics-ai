import { FootfallWorker } from './worker.js';
import { workerConfig } from './config.js';

console.log('====================================================');
console.log('🤖 DBI Intelligence — Footfall AI Worker Service');
console.log(`🌐 Target Core API: ${workerConfig.apiBaseUrl}`);
console.log(`🧠 AI Model Version: ${workerConfig.modelVersion}`);
console.log('====================================================');

// Default demo camera and shop identifiers for standalone running
const defaultCameraId = process.env.CAMERA_ID || 'demo_camera_entrance';
const defaultShopId = process.env.SHOP_ID || 'demo_shop_retail';

const worker = new FootfallWorker({
  cameraId: defaultCameraId,
  shopId: defaultShopId,
  virtualLine: { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 },
  inDirectionRule: 'TOP_TO_BOTTOM',
  heartbeatIntervalSec: workerConfig.heartbeatIntervalSec,
});

worker.start();
worker.startSimulation(4000);

process.on('SIGINT', () => {
  console.log('\n[AI Worker] Gracefully shutting down...');
  worker.stop();
  process.exit(0);
});
