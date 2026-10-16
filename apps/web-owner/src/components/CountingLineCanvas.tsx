import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NormalizedCoordinates, Direction } from '../types';
import { CheckIcon, SlidersIcon, AlertTriangleIcon } from './icons';

interface CountingLineCanvasProps {
  initialCoordinates?: NormalizedCoordinates;
  initialInDirection?: Direction;
  initialOutDirection?: Direction;
  initialEnabled?: boolean;
  cameraName: string;
  onSave: (data: {
    coordinates: NormalizedCoordinates;
    inDirection: Direction;
    outDirection: Direction;
    enabled: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}

export const CountingLineCanvas: React.FC<CountingLineCanvasProps> = ({
  initialCoordinates = { x1: 0.15, y1: 0.55, x2: 0.85, y2: 0.55 },
  initialInDirection = 'IN',
  initialOutDirection = 'OUT',
  initialEnabled = true,
  cameraName,
  onSave,
  onCancel
}) => {
  const [coords, setCoords] = useState<NormalizedCoordinates>(initialCoordinates);
  const [inDir, setInDir] = useState<Direction>(initialInDirection);
  const [outDir, setOutDir] = useState<Direction>(initialOutDirection);
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [dragHandle, setDragHandle] = useState<'p1' | 'p2' | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handlePointerDown = (handle: 'p1' | 'p2', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragHandle(handle);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragHandle || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

    const roundedX = Math.round(x * 100) / 100;
    const roundedY = Math.round(y * 100) / 100;

    if (dragHandle === 'p1') {
      setCoords(prev => ({ ...prev, x1: roundedX, y1: roundedY }));
    } else {
      setCoords(prev => ({ ...prev, x2: roundedX, y2: roundedY }));
    }
  }, [dragHandle]);

  const handlePointerUp = useCallback(() => {
    setDragHandle(null);
  }, []);

  useEffect(() => {
    const handleGlobalUp = () => setDragHandle(null);
    window.addEventListener('pointerup', handleGlobalUp);
    return () => window.removeEventListener('pointerup', handleGlobalUp);
  }, []);

  const handlePreset = (type: 'horizontal' | 'vertical' | 'diagonal') => {
    if (type === 'horizontal') {
      setCoords({ x1: 0.15, y1: 0.55, x2: 0.85, y2: 0.55 });
    } else if (type === 'vertical') {
      setCoords({ x1: 0.50, y1: 0.15, x2: 0.50, y2: 0.85 });
    } else {
      setCoords({ x1: 0.20, y1: 0.30, x2: 0.80, y2: 0.70 });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        coordinates: coords,
        inDirection: inDir,
        outDirection: outDir,
        enabled
      });
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  // Calculate midpoint for direction indicator
  const midX = (coords.x1 + coords.x2) / 2;
  const midY = (coords.y1 + coords.y2) / 2;

  // Calculate normal vector perpendicular to line for IN/OUT arrows
  const dx = coords.x2 - coords.x1;
  const dy = coords.y2 - coords.y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden max-w-3xl w-full my-auto flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2.5 shrink-0">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <SlidersIcon size={20} className="text-blue-600 shrink-0" />
            <span>Virtual Counting Line Calibration</span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Camera: <span className="font-semibold text-gray-700">{cameraName}</span> • Drag endpoints or enter normalized values (0..1)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-gray-300 shadow-2xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <span>Line Active</span>
          </label>
        </div>
      </div>

      <div className="p-3 sm:p-6 flex-1 overflow-y-auto space-y-4">
        {/* Interactive Canvas Viewport */}
        <div
          ref={containerRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-gray-800 bg-gray-950 select-none shadow-inner cursor-crosshair group touch-none"
        >
          {/* Simulated Entrance Camera Feed Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-zinc-900 opacity-90">
            {/* Perspective shop entrance grid lines */}
            <svg className="w-full h-full opacity-25" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              {/* Floor perspective */}
              <line x1="20%" y1="100%" x2="40%" y2="40%" stroke="cyan" strokeWidth="1" strokeDasharray="4" />
              <line x1="80%" y1="100%" x2="60%" y2="40%" stroke="cyan" strokeWidth="1" strokeDasharray="4" />
              <line x1="0%" y1="75%" x2="100%" y2="75%" stroke="white" strokeWidth="0.5" opacity="0.4" />
            </svg>
          </div>

          {/* OSD (On Screen Display) Overlay */}
          <div className="absolute top-2 sm:top-3 left-2 sm:left-3 bg-black/70 backdrop-blur px-2 sm:px-2.5 py-0.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 sm:gap-2 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            REC • RTSP STREAM • 1080p
          </div>

          <div className="absolute top-2 sm:top-3 right-2 sm:right-3 bg-black/70 backdrop-blur px-2 sm:px-2.5 py-0.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-mono text-amber-300 border border-amber-500/30">
            STATUS: {enabled ? 'ACTIVE' : 'PAUSED'}
          </div>

          {/* Interactive SVG Overlay */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* The Virtual Counting Line */}
            <line
              x1={`${coords.x1 * 100}%`}
              y1={`${coords.y1 * 100}%`}
              x2={`${coords.x2 * 100}%`}
              y2={`${coords.y2 * 100}%`}
              stroke={enabled ? '#3b82f6' : '#9ca3af'}
              strokeWidth="4"
              strokeDasharray={enabled ? 'none' : '6 4'}
            />

            {/* Glowing highlight for active line */}
            {enabled && (
              <line
                x1={`${coords.x1 * 100}%`}
                y1={`${coords.y1 * 100}%`}
                x2={`${coords.x2 * 100}%`}
                y2={`${coords.y2 * 100}%`}
                stroke="#60a5fa"
                strokeWidth="10"
                opacity="0.3"
              />
            )}

            {/* IN Direction Normal Arrow */}
            {enabled && (
              <g transform={`translate(${midX * 100}%, ${midY * 100}%)`}>
                <line
                  x1="0"
                  y1="0"
                  x2={`${nx * 32}`}
                  y2={`${ny * 32}`}
                  stroke="#10b981"
                  strokeWidth="3"
                  markerEnd="url(#arrow-in)"
                />
                <circle cx={`${nx * 38}`} cy={`${ny * 38}`} r="12" fill="#10b981" />
                <text x={`${nx * 38}`} y={`${ny * 38 + 4}`} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                  {inDir}
                </text>
              </g>
            )}

            {/* OUT Direction Normal Arrow */}
            {enabled && (
              <g transform={`translate(${midX * 100}%, ${midY * 100}%)`}>
                <line
                  x1="0"
                  y1="0"
                  x2={`${-nx * 32}`}
                  y2={`${-ny * 32}`}
                  stroke="#f43f5e"
                  strokeWidth="3"
                />
                <circle cx={`${-nx * 38}`} cy={`${-ny * 38}`} r="12" fill="#f43f5e" />
                <text x={`${-nx * 38}`} y={`${-ny * 38 + 4}`} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                  {outDir}
                </text>
              </g>
            )}
          </svg>

          {/* Interactive Drag Handle P1 */}
          <div
            onPointerDown={(e) => handlePointerDown('p1', e)}
            style={{ left: `${coords.x1 * 100}%`, top: `${coords.y1 * 100}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center text-white text-[11px] font-bold z-20 ${
              dragHandle === 'p1' ? 'ring-4 ring-blue-400 scale-125' : 'hover:scale-110'
            } transition-transform touch-none`}
            title="Endpoint A (x1, y1)"
          >
            A
          </div>

          {/* Interactive Drag Handle P2 */}
          <div
            onPointerDown={(e) => handlePointerDown('p2', e)}
            style={{ left: `${coords.x2 * 100}%`, top: `${coords.y2 * 100}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-indigo-600 border-2 border-white shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center text-white text-[11px] font-bold z-20 ${
              dragHandle === 'p2' ? 'ring-4 ring-indigo-400 scale-125' : 'hover:scale-110'
            } transition-transform touch-none`}
            title="Endpoint B (x2, y2)"
          >
            B
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-gray-500 font-semibold text-[11px] sm:text-xs">Quick Presets:</span>
            <button
              type="button"
              onClick={() => handlePreset('horizontal')}
              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-xs transition"
            >
              Horizontal Entrance
            </button>
            <button
              type="button"
              onClick={() => handlePreset('vertical')}
              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-xs transition"
            >
              Vertical Turnstile
            </button>
            <button
              type="button"
              onClick={() => handlePreset('diagonal')}
              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-xs transition"
            >
              Corner Entrance
            </button>
          </div>

          <div className="text-gray-400 text-[11px]">
            Coords: 0.00 to 1.00
          </div>
        </div>

        {/* Precise Coordinate Inputs & Direction Configuration */}
        <form onSubmit={handleSubmit} className="border-t border-gray-200 pt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Point A X1</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={coords.x1}
                onChange={e => setCoords({ ...coords, x1: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-2 sm:py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Point A Y1</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={coords.y1}
                onChange={e => setCoords({ ...coords, y1: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-2 sm:py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Point B X2</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={coords.x2}
                onChange={e => setCoords({ ...coords, x2: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-2 sm:py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Point B Y2</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={coords.y2}
                onChange={e => setCoords({ ...coords, y2: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-2 sm:py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Normal In-Direction</label>
              <select
                value={inDir}
                onChange={e => setInDir(e.target.value as Direction)}
                className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="IN">IN (Entering the store)</option>
                <option value="OUT">OUT (Exiting the store)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Normal Out-Direction</label>
              <select
                value={outDir}
                onChange={e => setOutDir(e.target.value as Direction)}
                className="w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="OUT">OUT (Exiting the store)</option>
                <option value="IN">IN (Entering the store)</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangleIcon size={16} className="mt-0.5 text-amber-600 shrink-0" />
            <span>
              <strong>Counting rule notice:</strong> The AI model tracks detected persons briefly and registers crossing events when their center centroid crosses this virtual line. Set line across the entrance doorway for optimal crossing detection.
            </span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2 pt-3">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-50 transition text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition text-center"
            >
              {isSaving ? (
                <>Saving Line Config...</>
              ) : (
                <>
                  <CheckIcon size={16} />
                  Save Counting Line
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
