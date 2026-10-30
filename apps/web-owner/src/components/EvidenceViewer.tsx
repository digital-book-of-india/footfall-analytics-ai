import React, { useEffect, useState } from 'react';
import { SecurityEvent } from '../types';
import { API_ORIGIN } from '../services/apiClient';
import { AlertTriangleIcon, VideoIcon, RefreshCwIcon } from './icons';

// Evidence links come back as relative paths ("/api/v1/evidence/..."). Left alone, the browser
// would look for them on the owner app's own origin, not the backend's.
function apiAddress(url: string): string {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  return `${API_ORIGIN}${url}`;
}

interface EvidenceViewerProps {
  event: SecurityEvent;
  /** re-fetches the event to get a fresh (not expired) evidence link */
  onReload: () => void;
}

export const EvidenceViewer: React.FC<EvidenceViewerProps> = ({ event, onReload }) => {
  const snapshotUrl = event.evidence?.snapshotUrl ? apiAddress(event.evidence.snapshotUrl) : undefined;
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    setImageState('loading');
  }, [snapshotUrl]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-sm font-bold text-gray-900 mb-3">Evidence</h2>

      {!snapshotUrl ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <VideoIcon size={28} className="text-gray-400" />
          <p className="mt-3 text-sm font-semibold text-gray-700">No picture available</p>
          <p className="mt-1 max-w-sm text-xs text-gray-500">
            Pictures are kept for a limited time, and one may not have been captured for this alert.
          </p>
        </div>
      ) : imageState === 'failed' ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertTriangleIcon size={28} className="mx-auto text-rose-500" />
          <p className="mt-2 text-sm font-semibold text-rose-700">The picture could not be loaded.</p>
          <p className="mt-1 text-xs text-gray-500">It may have expired. Try again to get a fresh link.</p>
          <button
            type="button"
            onClick={() => {
              setImageState('loading');
              onReload();
            }}
            className="mt-3 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition"
          >
            <RefreshCwIcon size={14} />
            Try again
          </button>
        </div>
      ) : (
        <figure>
          <div className="relative overflow-hidden rounded-xl border border-gray-800 bg-slate-900">
            {imageState === 'loading' && <div className="absolute inset-0 animate-pulse bg-slate-800" />}
            <img
              src={snapshotUrl}
              alt={`Camera picture for this alert, ${new Date(event.startedAt).toLocaleString()}`}
              className="relative mx-auto max-h-[28rem] w-full object-contain"
              onLoad={() => setImageState('ready')}
              onError={() => setImageState('failed')}
            />
          </div>
          <figcaption className="mt-2 text-xs text-gray-500">
            Picture from {new Date(event.startedAt).toLocaleString()}.
          </figcaption>
        </figure>
      )}

      <p className="mt-4 text-[11px] text-gray-400">Camera pictures are a guide only. They may not show everything that happened.</p>
    </div>
  );
};
