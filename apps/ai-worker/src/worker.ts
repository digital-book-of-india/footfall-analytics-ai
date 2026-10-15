import { v4 as uuidv4 } from 'uuid';
import { CoreApiClient } from './client/apiClient.js';
import { detectLineCrossing, Point2D } from './geometry/lineCrossing.js';
import { workerConfig } from './config.js';
import { NormalizedCoordinates, Direction } from '@dbi/shared-types';

export interface WorkerOptions {
  cameraId: string;
  shopId: string;
  virtualLine?: NormalizedCoordinates;
  inDirectionRule?: string;
  heartbeatIntervalSec?: number;
}

export class FootfallWorker {
  private cameraId: string;
  private shopId: string;
  private virtualLine: NormalizedCoordinates;
  private inDirectionRule: string;
  private apiClient: CoreApiClient;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private simulationTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(options: WorkerOptions, apiClient?: CoreApiClient) {
    this.cameraId = options.cameraId;
    this.shopId = options.shopId;
    this.virtualLine = options.virtualLine || { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 };
    this.inDirectionRule = options.inDirectionRule || 'TOP_TO_BOTTOM';
    this.apiClient = apiClient || new CoreApiClient();
  }

  /**
   * Start worker background heartbeat loop
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[AI Worker] Starting worker for Camera: ${this.cameraId} (Shop: ${this.shopId})`);

    // Initial heartbeat
    this.sendHeartbeat();

    // Schedule recurring heartbeat
    const intervalMs = (workerConfig.heartbeatIntervalSec || 30) * 1000;
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);
  }

  /**
   * Send heartbeat to Core API
   */
  async sendHeartbeat(): Promise<boolean> {
    return this.apiClient.sendHeartbeat({
      cameraId: this.cameraId,
      shopId: this.shopId,
      status: 'ONLINE',
      fps: 29.8,
      droppedFrames: 0,
      modelVersion: workerConfig.modelVersion,
    });
  }

  /**
   * Process a tracked person's movement trajectory segment
   */
  async processTrajectory(prevPoint: Point2D, currPoint: Point2D, confidence = 0.95): Promise<Direction | null> {
    const direction = detectLineCrossing(this.virtualLine, prevPoint, currPoint, this.inDirectionRule);

    if (direction) {
      const eventId = `evt_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
      console.log(`[AI Worker] 🚨 Crossing Detected: ${direction} (Confidence: ${confidence}, Event: ${eventId})`);

      await this.apiClient.sendFootfallEvent({
        eventId,
        shopId: this.shopId,
        cameraId: this.cameraId,
        direction,
        occurredAt: new Date().toISOString(),
        confidence,
        modelVersion: workerConfig.modelVersion,
      });

      return direction;
    }

    return null;
  }

  /**
   * Run realistic test clip / synthetic simulation
   * Simulates customers crossing the entrance line at regular intervals
   */
  startSimulation(intervalMs = 3000): void {
    console.log(`[AI Worker] Starting DEMO traffic simulation (every ${intervalMs}ms)...`);
    let toggle = true;

    this.simulationTimer = setInterval(async () => {
      // Alternate between IN and OUT to simulate natural store traffic
      if (toggle) {
        // Customer walking IN: from top (y=0.3) to bottom (y=0.7) across horizontal line at y=0.5
        await this.processTrajectory({ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.7 });
      } else {
        // Customer walking OUT: from bottom (y=0.7) to top (y=0.3)
        await this.processTrajectory({ x: 0.5, y: 0.7 }, { x: 0.5, y: 0.3 });
      }
      toggle = !toggle;
    }, intervalMs);
  }

  /**
   * Stop all timers and shutdown cleanly
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    this.isRunning = false;
    console.log(`[AI Worker] Stopped worker for Camera: ${this.cameraId}`);
  }
}
