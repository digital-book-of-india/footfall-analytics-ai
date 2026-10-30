import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Point, ZoneType, ZoneSensitivity } from '../types';
import { MAX_POINTS, ZONE_PRESETS, validateZonePoints, polygonArea, clamp01 } from '../lib/zone';
import { CheckIcon, ShieldIcon, AlertTriangleIcon } from './icons';

interface ZoneEditorModalProps {
  initialPolygon?: Point[];
  initialZoneType?: ZoneType;
  initialSensitivity?: ZoneSensitivity;
  initialEnabled?: boolean;
  cameraName: string;
  /** Latest camera frame (JPEG); resolves null when none has arrived yet. */
  fetchFrame?: () => Promise<{ blob: Blob } | null>;
  /** Asks the worker to push frames at the fast rate while the editor is open. */
  requestLive?: () => Promise<unknown>;
  onSave: (data: { polygon: Point[]; zoneType: ZoneType; sensitivity: ZoneSensitivity; enabled: boolean }) => Promise<void>;
  onCancel: () => void;
}

const ZONE_TYPES: Array<{ value: ZoneType; label: string }> = [
  { value: 'SHUTTER', label: 'Shutter' },
  { value: 'GATE', label: 'Gate' },
  { value: 'ENTRANCE', label: 'Entrance' },
  { value: 'CUSTOM', label: 'Custom area' }
];

const SENSITIVITY_OPTIONS: Array<{ value: ZoneSensitivity; label: string }> = [
  { value: 'LOW', label: 'Low: fewer alerts' },
  { value: 'MEDIUM', label: 'Medium: balanced' },
  { value: 'HIGH', label: 'High: more alerts' }
];

export const ZoneEditorModal: React.FC<ZoneEditorModalProps> = ({
  initialPolygon = [],
  initialZoneType = 'SHUTTER',
  initialSensitivity = 'MEDIUM',
  initialEnabled = true,
  cameraName,
  fetchFrame,
  requestLive,
  onSave,
  onCancel
}) => {
  const [points, setPoints] = useState<Point[]>(initialPolygon);
  const [zoneType, setZoneType] = useState<ZoneType>(initialZoneType);
  const [sensitivity, setSensitivity] = useState<ZoneSensitivity>(initialSensitivity);
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Real camera frame as the editor background; the dummy grid stays as fallback.
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameAspect, setFrameAspect] = useState<number | null>(null);
  const [frameLoading, setFrameLoading] = useState<boolean>(!!fetchFrame);
  const [frameTick, setFrameTick] = useState<number>(0);

  useEffect(() => {
    if (!fetchFrame) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    setFrameLoading(true);

    const poll = async () => {
      attempts += 1;
      const frame = await fetchFrame().catch(() => null);
      if (stopped) return;
      if (frame) {
        const url = URL.createObjectURL(frame.blob);
        setFrameUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setFrameLoading(false);
      } else if (attempts < 15) {
        timer = setTimeout(poll, 1500);
      } else {
        setFrameLoading(false);
      }
    };

    requestLive?.().catch(() => undefined);
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameTick]);

  useEffect(() => {
    return () => {
      if (frameUrl) URL.revokeObjectURL(frameUrl);
    };
  }, [frameUrl]);

  const toNormalized = (clientX: number, clientY: number): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height)
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (points.length >= MAX_POINTS) return;
    setPoints(prev => [...prev, toNormalized(e.clientX, e.clientY)]);
    setSelected(points.length);
  };

  const handlePointPointerDown = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragIndex(index);
    setSelected(index);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIndex === null || !containerRef.current) return;
    const p = toNormalized(e.clientX, e.clientY);
    setPoints(prev => prev.map((pt, i) => (i === dragIndex ? p : pt)));
  }, [dragIndex]);

  const handlePointerUp = useCallback(() => setDragIndex(null), []);

  useEffect(() => {
    const up = () => setDragIndex(null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const problem = useMemo(() => (points.length === 0 ? null : validateZonePoints(points)), [points]);
  const coverage = points.length >= 3 ? Math.round(polygonArea(points) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = validateZonePoints(points);
    if (message) {
      setSaveError(message);
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      await onSave({ polygon: points, zoneType, sensitivity, enabled });
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save zone');
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  };

  const polygonPoints = points.map(p => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden max-w-3xl w-full my-auto flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2.5 shrink-0">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShieldIcon size={20} className="text-blue-600 shrink-0" />
            <span>Security Zone Editor</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Camera: <span className="font-semibold text-gray-700">{cameraName}</span> • Outline the area to watch (e.g. a shutter or gate)
          </p>
        </div>
        <label className="text-xs font-semibold text-gray-700 flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-gray-300 shadow-2xs">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
          />
          <span>Watch this zone</span>
        </label>
      </div>

      <div className="p-3 sm:p-6 flex-1 overflow-y-auto space-y-4">
        {/* Interactive Canvas Viewport */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={frameAspect ? { aspectRatio: String(frameAspect) } : undefined}
          className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-gray-800 bg-gray-950 select-none shadow-inner cursor-crosshair group touch-none"
        >
          {frameUrl && (
            <img
              src={frameUrl}
              alt={`${cameraName} frame`}
              draggable={false}
              onLoad={e => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (w && h) setFrameAspect(w / h);
              }}
              className="absolute inset-0 w-full h-full object-fill pointer-events-none"
            />
          )}

          <div className={`absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-zinc-900 opacity-90 ${frameUrl ? 'hidden' : ''}`}>
            <svg className="w-full h-full opacity-25" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="zone-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#zone-grid)" />
            </svg>
          </div>

          <div className="absolute top-2 sm:top-3 left-2 sm:left-3 bg-black/70 backdrop-blur px-2 sm:px-2.5 py-0.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 sm:gap-2 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {frameUrl ? 'LIVE FRAME' : frameLoading ? 'LOADING FRAME…' : 'NO FRAME YET'}
          </div>

          {fetchFrame && (
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setFrameTick(t => t + 1)}
              className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 z-30 bg-black/70 hover:bg-black/90 px-2.5 py-1 rounded text-[11px] font-medium text-white border border-white/30"
            >
              Refresh frame
            </button>
          )}

          <div className="absolute top-2 sm:top-3 right-2 sm:right-3 bg-black/70 backdrop-blur px-2 sm:px-2.5 py-0.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-mono text-amber-300 border border-amber-500/30">
            STATUS: {enabled ? 'ACTIVE' : 'PAUSED'}
          </div>

          {/* Click-to-add surface */}
          <div
            onPointerDown={handleCanvasPointerDown}
            className="absolute inset-0 z-10"
          />

          {/* Polygon overlay */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
            {points.length >= 3 && (
              <polygon
                points={polygonPoints}
                fill={problem ? 'rgba(244,63,94,0.25)' : 'rgba(59,130,246,0.3)'}
                stroke={problem ? '#f43f5e' : '#3b82f6'}
                strokeWidth="3"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {points.length === 2 && (
              <polyline
                points={polygonPoints}
                fill="none"
                stroke={problem ? '#f43f5e' : '#3b82f6'}
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Drag handles (HTML, not SVG, so pointer events + percentage positioning stay simple) */}
          {points.map((p, i) => (
            <div
              key={i}
              onPointerDown={e => handlePointPointerDown(i, e)}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-blue-600 border-2 border-white shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center text-white text-[11px] font-bold z-30 ${
                selected === i ? 'ring-4 ring-blue-400 scale-125' : 'hover:scale-110'
              } transition-transform touch-none`}
              title={`Point ${i + 1}`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-gray-500 font-semibold text-[11px] sm:text-xs">Quick start:</span>
            {ZONE_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setPoints(preset.points.map(p => ({ ...p })));
                  setSelected(null);
                }}
                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-xs transition"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              disabled={points.length === 0}
              onClick={() => {
                setPoints(prev => prev.slice(0, -1));
                setSelected(null);
              }}
              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-xs transition disabled:opacity-40"
            >
              Undo last point
            </button>
            <button
              type="button"
              disabled={points.length === 0}
              onClick={() => {
                setPoints([]);
                setSelected(null);
              }}
              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-xs transition disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        {problem ? (
          <p className="text-xs font-medium text-rose-600">{problem}</p>
        ) : (
          <p className="text-xs text-gray-500">
            {points.length === 0
              ? 'Click on the picture to place points around the area, or pick a quick start.'
              : `${points.length} point${points.length === 1 ? '' : 's'} placed${coverage ? `, covering about ${coverage}% of the picture` : ''}. Drag a point to adjust it.`}
          </p>
        )}

        {/* Zone settings */}
        <form onSubmit={handleSubmit} className="border-t border-gray-200 pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Area type</label>
              <select
                value={zoneType}
                onChange={e => setZoneType(e.target.value as ZoneType)}
                className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
              >
                {ZONE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Sensitivity</label>
              <select
                value={sensitivity}
                onChange={e => setSensitivity(e.target.value as ZoneSensitivity)}
                className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
              >
                {SENSITIVITY_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">Higher sensitivity can create more false alarms.</p>
            </div>
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangleIcon size={16} className="mt-0.5 text-amber-600 shrink-0" />
            <span>
              <strong>Alert rule notice:</strong> The AI model raises an alert once a detected person stands in this
              zone long enough, with a picture attached as evidence. It does not identify who the person is.
            </span>
          </div>

          {saveError && (
            <p className="text-xs font-medium text-rose-600">{saveError}</p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50 transition text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || points.length === 0}
              className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition text-center"
            >
              {isSaving ? (
                <>Saving Zone...</>
              ) : (
                <>
                  <CheckIcon size={16} />
                  Save Zone
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
