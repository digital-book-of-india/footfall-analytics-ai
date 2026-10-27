import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { sendSuccess } from '../utils/response.js';
import { config } from '../config.js';

export const webrtcRouter = Router();

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * GET /api/v1/webrtc/ice
 * ICE server list for the owner app's browser-side WebRTC live view. Cloudflare Realtime
 * TURN credentials are optional (short-lived, generated server-side so the API token
 * never reaches the browser) — any failure or missing config falls back to STUN-only
 * rather than blocking live view entirely.
 */
webrtcRouter.get('/ice', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  const stunServer: IceServer = { urls: ['stun:stun.cloudflare.com:3478'] };

  if (!config.cfTurnKeyId || !config.cfTurnApiToken) {
    sendSuccess(res, { iceServers: [stunServer], turn: false });
    return;
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${config.cfTurnKeyId}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.cfTurnApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 3600 }),
      }
    );

    if (!response.ok) {
      throw new Error(`Cloudflare TURN request failed with status ${response.status}`);
    }

    const body = (await response.json()) as { iceServers?: IceServer | IceServer[] };
    const turnServers: IceServer[] = Array.isArray(body.iceServers)
      ? body.iceServers
      : body.iceServers
      ? [body.iceServers]
      : [];

    sendSuccess(res, { iceServers: [stunServer, ...turnServers], turn: turnServers.length > 0 });
  } catch (err) {
    console.error('[webrtc/ice] Cloudflare TURN credential fetch failed, falling back to STUN-only:', err);
    sendSuccess(res, { iceServers: [stunServer], turn: false });
  }
});
