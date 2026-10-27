import { api } from '../services/apiClient';

const ICE_GATHER_TIMEOUT_MS = 3000;
const CONNECT_TIMEOUT_MS = 12000;
const FIRST_FRAME_TIMEOUT_MS = 8000;

export type WebRtcCloseFn = () => void;

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const finish = () => {
      if (done) return;
      done = true;
      pc.removeEventListener('icegatheringstatechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
  });
}

function waitForConnected(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const settle = (fn: () => void) => {
      if (done) return;
      done = true;
      pc.removeEventListener('connectionstatechange', onChange);
      clearTimeout(timer);
      fn();
    };
    const onChange = () => {
      if (pc.connectionState === 'connected') {
        settle(resolve);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        settle(() => reject(new Error('WebRTC connection failed')));
      }
    };
    pc.addEventListener('connectionstatechange', onChange);
    const timer = setTimeout(
      () => settle(() => reject(new Error('WebRTC connection timed out'))),
      CONNECT_TIMEOUT_MS
    );
    onChange();
  });
}

function waitForFirstFrame(videoEl: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const hasFrame = () => videoEl.videoWidth > 0 && videoEl.readyState >= 2;
    const settle = (fn: () => void) => {
      if (done) return;
      done = true;
      videoEl.removeEventListener('loadeddata', onEvent);
      videoEl.removeEventListener('playing', onEvent);
      clearTimeout(timer);
      fn();
    };
    const onEvent = () => {
      if (hasFrame()) settle(resolve);
    };
    if (hasFrame()) {
      resolve();
      return;
    }
    videoEl.addEventListener('loadeddata', onEvent);
    videoEl.addEventListener('playing', onEvent);
    const timer = setTimeout(
      () => settle(() => reject(new Error('No video frames decoded'))),
      FIRST_FRAME_TIMEOUT_MS
    );
  });
}

/**
 * Connects a camera's live video over WebRTC. Only resolves once a frame has
 * actually decoded onto `videoEl` — a connection that never renders a frame
 * (e.g. unsupported codec) is treated as a failure so the caller can fall
 * back to the picture-polling view instead of showing a blank "Live" tile.
 */
export async function connectWebRtc(
  cameraId: string,
  videoEl: HTMLVideoElement,
  onLost: () => void
): Promise<WebRtcCloseFn> {
  const { iceServers } = await api.iceServers();
  const pc = new RTCPeerConnection({ iceServers });

  try {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = event => {
      videoEl.srcObject = event.streams[0];
      videoEl.play().catch(() => {});
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    const localSdp = pc.localDescription?.sdp || offer.sdp || '';
    const { answer } = await api.webrtcOffer(cameraId, localSdp);
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });

    await waitForConnected(pc);
    await waitForFirstFrame(videoEl);

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'closed'
      ) {
        onLost();
      }
    };

    return () => {
      pc.onconnectionstatechange = null;
      pc.close();
    };
  } catch (err) {
    pc.close();
    throw err;
  }
}

export function describeWebRtcError(err: any): string {
  const message: string = err?.message || '';
  if (message.includes('CONNECTOR_OFFLINE')) {
    return 'The on-site connector for this camera is offline.';
  }
  if (message.includes('CONNECTOR_TIMEOUT')) {
    return 'The on-site connector did not respond in time.';
  }
  if (message.includes('WEBRTC_FAILED')) {
    return 'Could not start a live video connection to this camera.';
  }
  if (err?.status === 0) {
    return 'Network error reaching the server.';
  }
  if (message.includes('No video frames')) {
    return 'Connected, but no video frames were received.';
  }
  if (message.includes('timed out') || message.includes('WebRTC connection')) {
    return 'The live video connection timed out.';
  }
  return 'Could not start live video. Showing pictures instead.';
}
