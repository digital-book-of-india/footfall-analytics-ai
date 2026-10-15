import { workerConfig } from '../config.js';
import { 
  IngestFootfallEventRequest, 
  IngestEventResponseData, 
  AIHeartbeatRequest, 
  ApiResponse 
} from '@dbi/shared-types';

export class CoreApiClient {
  private baseUrl: string;
  private secret: string;

  constructor(baseUrl = workerConfig.apiBaseUrl, secret = workerConfig.aiSharedSecret) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secret = secret;
  }

  /**
   * Send crossing event to Core API
   */
  async sendFootfallEvent(event: IngestFootfallEventRequest): Promise<IngestEventResponseData | null> {
    const url = `${this.baseUrl}/internal/v1/footfall/events`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-secret': this.secret,
        },
        body: JSON.stringify(event),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[AI Client] Event ingestion failed with status ${res.status}:`, errorText);
        return null;
      }

      const json = (await res.json()) as ApiResponse<IngestEventResponseData>;
      return json.data;
    } catch (err: any) {
      console.error(`[AI Client] Network error sending footfall event:`, err.message);
      return null;
    }
  }

  /**
   * Send heartbeat to Core API
   */
  async sendHeartbeat(payload: AIHeartbeatRequest): Promise<boolean> {
    const url = `${this.baseUrl}/internal/v1/footfall/health`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-secret': this.secret,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error(`[AI Client] Heartbeat ping failed with status ${res.status}`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[AI Client] Network error sending heartbeat:`, err.message);
      return false;
    }
  }
}
