import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { Camera } from '../types';
import { api } from '../services/apiClient';
import { connectWebRtc, describeWebRtcError, WebRtcCloseFn } from '../lib/webrtc';
import { VideoIcon, RefreshCwIcon, AlertTriangleIcon } from '../components/icons';

// Only auto-attempt WebRTC for every camera when there are few enough that
// decoding all of them at once won't overload the shop PC / browser.
const MAX_AUTO_VIDEO = 4;
const KEEP_ALIVE_MS = 10000;
const FRAME_POLL_MS = 1000;
const STALE_AFTER_SECONDS = 10;

type TileMode = 'connecting' | 'video' | 'pictures';

interface LiveTileProps {
  camera: Camera;
  autoVideo: boolean;
}

const LiveTile: React.FC<LiveTileProps> = ({ camera, autoVideo }) => {
  const [mode, setMode] = useState<TileMode>('pictures');
  const [reason, setReason] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameAt, setFrameAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeRef = useRef<WebRtcCloseFn | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Kick off exactly one auto WebRTC attempt on mount for eligible tiles.
  useEffect(() => {
    if (autoVideo) {
      setMode('connecting');
      setAttempt(a => a + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebRTC attempt — only runs when `attempt` is bumped (auto on mount, or the
  // "Watch live video" button). The same <video> element stays mounted across
  // mode changes (hidden via CSS) so a successful ontrack handler keeps working.
  useEffect(() => {
    if (attempt === 0) return;
    let cancelled = false;
    setMode('connecting');
    setReason(null);

    (async () => {
      if (!videoRef.current) return;
      try {
        const close = await connectWebRtc(camera.id, videoRef.current, () => {
          if (!cancelled) setMode('pictures');
        });
        if (cancelled) {
          close();
          return;
        }
        closeRef.current = close;
        setMode('video');
      } catch (err: any) {
        if (cancelled) return;
        setReason(describeWebRtcError(err));
        setMode('pictures');
      }
    })();

    return () => {
      cancelled = true;
      closeRef.current?.();
      closeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.id, attempt]);

  // Picture-polling fallback, active only while not showing live video.
  useEffect(() => {
    if (mode === 'video') return;
    let stopped = false;

    const keepAlive = () => {
      api.requestLive(camera.id).catch(() => {});
    };
    keepAlive();
    const keepAliveTimer = setInterval(keepAlive, KEEP_ALIVE_MS);

    const poll = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      const frame = await api.fetchLiveFrame(camera.id);
      if (stopped || !frame) return;
      const url = URL.createObjectURL(frame.blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      setFrameUrl(url);
      setFrameAt(frame.at ? new Date(frame.at).getTime() : Date.now());
    };
    poll();
    const pollTimer = setInterval(poll, FRAME_POLL_MS);
    const tickTimer = setInterval(() => setNowTick(Date.now()), 1000);

    return () => {
      stopped = true;
      clearInterval(keepAliveTimer);
      clearInterval(pollTimer);
      clearInterval(tickTimer);
    };
  }, [mode, camera.id]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const ageSeconds = frameAt !== null ? Math.max(0, Math.floor((nowTick - frameAt) / 1000)) : null;
  const stale = ageSeconds !== null && ageSeconds > STALE_AFTER_SECONDS;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="relative aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
        {/* Kept mounted across mode changes so WebRTC's ontrack handler stays attached. */}
        <video
          ref={videoRef}
          className={`w-full h-full object-contain ${mode === 'video' ? '' : 'hidden'}`}
          muted
          playsInline
          autoPlay
        />

        {mode !== 'video' &&
          (frameUrl ? (
            <img src={frameUrl} alt={camera.name} className="absolute inset-0 w-full h-full object-contain" />
          ) : (
            <div className="text-slate-400 text-xs flex flex-col items-center gap-2">
              <VideoIcon size={28} />
              <span>{mode === 'connecting' ? 'Connecting...' : 'Waiting for picture...'}</span>
            </div>
          ))}

        {mode === 'video' && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            Live video
          </span>
        )}
        {mode === 'pictures' && (
          <span
            className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              stale ? 'bg-amber-500 text-white' : 'bg-slate-700 text-white'
            }`}
          >
            {stale ? `Last picture ${ageSeconds}s ago` : 'Pictures, about 1 per second'}
          </span>
        )}
      </div>

      <div className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-900 truncate">{camera.name}</p>
          {reason && (
            <p className="text-[11px] text-rose-600 truncate" title={reason}>
              {reason}
            </p>
          )}
        </div>
        {mode !== 'video' && (
          <button
            type="button"
            disabled={mode === 'connecting'}
            onClick={() => setAttempt(a => a + 1)}
            className="shrink-0 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
          >
            {mode === 'connecting' ? 'Connecting...' : reason ? 'Try live video' : 'Watch live video'}
          </button>
        )}
      </div>
    </div>
  );
};

interface LiveViewPageProps {
  onOpenNewShopModal?: () => void;
}

export const LiveViewPage: React.FC<LiveViewPageProps> = () => {
  const { selectedShop, isLoading: shopLoading } = useShop();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCameras = useCallback(async () => {
    if (!selectedShop) {
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await api.getCameras(selectedShop.id);
      setCameras(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load cameras');
    } finally {
      setIsLoading(false);
    }
  }, [selectedShop]);

  useEffect(() => {
    setIsLoading(true);
    fetchCameras();
  }, [fetchCameras]);

  if (shopLoading && !selectedShop) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500 text-sm font-medium animate-pulse">Loading live view...</p>
      </div>
    );
  }

  if (!selectedShop) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center">
        <p className="text-gray-500 text-sm">Please select or create a store to view live cameras.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Live View</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Watch entrance cameras for {selectedShop.name} in real time, with a picture fallback when video isn't
            available.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchCameras}
          disabled={isLoading}
          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-gray-200 transition"
          title="Refresh camera list"
        >
          <RefreshCwIcon size={18} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-rose-800">
          <AlertTriangleIcon size={20} className="text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-600">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(n => (
            <div key={n} className="bg-white rounded-2xl border border-gray-200 animate-pulse aspect-video" />
          ))}
        </div>
      ) : cameras.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <VideoIcon size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No Cameras Configured</h3>
          <p className="text-gray-500 text-xs max-w-sm mx-auto">
            Add an entrance camera first from the Cameras & Lines tab.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map(camera => (
            <LiveTile key={camera.id} camera={camera} autoVideo={cameras.length <= MAX_AUTO_VIDEO} />
          ))}
        </div>
      )}
    </div>
  );
};
