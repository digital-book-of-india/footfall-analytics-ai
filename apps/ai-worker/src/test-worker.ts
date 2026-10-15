import { detectLineCrossing } from './geometry/lineCrossing.js';
import { FootfallWorker } from './worker.js';
import { CoreApiClient } from './client/apiClient.js';
import http from 'http';

/**
 * Self-contained verification suite for AI Worker:
 * - Geometry & crossing calculations (all 4 directions & edge cases)
 * - API Client communication & headers security
 * - Worker lifecycle (heartbeat, trajectory processing, simulation & clean shutdown)
 */
async function runWorkerVerification() {
  console.log('\n🧪 ===================================================');
  console.log('🤖 AI Worker Unit & Integration Test Suite');
  console.log('===================================================\n');

  // ==========================================================
  // Section 1: Pure 2D Line Crossing Geometry Tests
  // ==========================================================
  console.log('1️⃣  Testing Virtual Counting Line Geometry & Math:');
  const horizontalLine = { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 };

  // Case 1: Downward crossing (IN for TOP_TO_BOTTOM)
  const inCrossing = detectLineCrossing(horizontalLine, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }, 'TOP_TO_BOTTOM');
  console.log(`   • Downward Crossing (TOP_TO_BOTTOM): ${inCrossing}`);
  if (inCrossing !== 'IN') throw new Error(`Expected 'IN', got '${inCrossing}'`);

  // Case 2: Upward crossing (OUT for TOP_TO_BOTTOM)
  const outCrossing = detectLineCrossing(horizontalLine, { x: 0.5, y: 0.8 }, { x: 0.5, y: 0.2 }, 'TOP_TO_BOTTOM');
  console.log(`   • Upward Crossing (TOP_TO_BOTTOM): ${outCrossing}`);
  if (outCrossing !== 'OUT') throw new Error(`Expected 'OUT', got '${outCrossing}'`);

  // Case 3: Parallel non-crossing trajectory
  const parallelMotion = detectLineCrossing(horizontalLine, { x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 });
  console.log(`   • Parallel Non-Crossing Trajectory: ${parallelMotion}`);
  if (parallelMotion !== null) throw new Error(`Expected null for non-crossing motion, got '${parallelMotion}'`);

  // Case 4: Vertical Line Crossing (LEFT_TO_RIGHT)
  const verticalLine = { x1: 0.5, y1: 0.1, x2: 0.5, y2: 0.9 };
  const rightCrossing = detectLineCrossing(verticalLine, { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, 'LEFT_TO_RIGHT');
  console.log(`   • Rightward Crossing (LEFT_TO_RIGHT): ${rightCrossing}`);
  if (rightCrossing !== 'IN') throw new Error(`Expected 'IN', got '${rightCrossing}'`);

  console.log('   ✅ All geometry and direction vector checks passed successfully.\n');

  // ==========================================================
  // Section 2: Mock API Protocol & Worker Integration Tests
  // ==========================================================
  console.log('2️⃣  Testing Worker Protocol & Dispatch with Mock Core Server:');

  const receivedEvents: any[] = [];
  const receivedHeartbeats: any[] = [];
  const expectedSecret = 'dbi_ai_service_shared_secret_2026';

  // Lightweight mock server to verify HTTP contract without external DB dependencies
  const mockServer = http.createServer((req, res) => {
    const aiSecret = req.headers['x-ai-secret'];

    // Verify secret header
    if (aiSecret !== expectedSecret) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid AI Secret' } }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};

      if (req.url === '/internal/v1/footfall/events') {
        receivedEvents.push(parsed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: { processed: 1, ignoredDuplicates: 0 },
          requestId: 'req_mock_event',
        }));
      } else if (req.url === '/internal/v1/footfall/health') {
        receivedHeartbeats.push(parsed);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: { acknowledged: true, status: parsed.status, timestamp: new Date().toISOString() },
          requestId: 'req_mock_health',
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  const mockPort = 4010;
  await new Promise<void>((resolve) => mockServer.listen(mockPort, () => resolve()));
  const mockApiUrl = `http://localhost:${mockPort}`;

  try {
    const apiClient = new CoreApiClient(mockApiUrl, expectedSecret);
    const worker = new FootfallWorker(
      {
        cameraId: 'cam_test_01',
        shopId: 'shop_test_01',
        virtualLine: horizontalLine,
        inDirectionRule: 'TOP_TO_BOTTOM',
        heartbeatIntervalSec: 1, // Rapid for test
      },
      apiClient
    );

    // 1. Test Heartbeat Dispatch
    console.log('   • Testing worker heartbeat...');
    const hbSuccess = await worker.sendHeartbeat();
    if (!hbSuccess || receivedHeartbeats.length === 0) {
      throw new Error('Worker heartbeat failed to deliver to Core API');
    }
    const hb = receivedHeartbeats[0];
    console.log(`     -> Heartbeat acknowledged: Camera=${hb.cameraId}, Status=${hb.status}, FPS=${hb.fps}`);
    if (hb.cameraId !== 'cam_test_01' || hb.status !== 'ONLINE') {
      throw new Error('Heartbeat payload did not match camera configuration');
    }

    // 2. Test Crossing Trajectory Processing & Event Ingestion
    console.log('   • Testing trajectory detection and crossing dispatch...');
    const detected = await worker.processTrajectory(
      { x: 0.5, y: 0.3 },
      { x: 0.5, y: 0.7 },
      0.97
    );
    if (detected !== 'IN' || receivedEvents.length === 0) {
      throw new Error('Trajectory crossing event was not generated');
    }

    const event = receivedEvents[0];
    console.log(`     -> Event dispatched: ID=${event.eventId}, Direction=${event.direction}, Confidence=${event.confidence}`);
    if (!event.eventId.startsWith('evt_') || event.direction !== 'IN' || event.confidence !== 0.97) {
      throw new Error('Event payload mismatch in ingested data');
    }

    // 3. Test Simulation & Clean Shutdown
    console.log('   • Testing simulation ticker & graceful shutdown...');
    worker.startSimulation(100); // 100ms rapid ticks
    await new Promise((r) => setTimeout(r, 250)); // let simulation fire 2 ticks
    worker.stop();

    if (receivedEvents.length < 2) {
      throw new Error('Simulation ticker did not dispatch simulated crossing events');
    }
    console.log(`     -> Simulation fired successfully: Total events received = ${receivedEvents.length}`);

    console.log('\n✅ AI Worker self-contained test suite passed with 100% success! 🎉\n');
  } finally {
    mockServer.close();
  }
}

runWorkerVerification();
