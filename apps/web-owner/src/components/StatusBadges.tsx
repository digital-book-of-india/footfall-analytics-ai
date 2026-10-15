import React from 'react';
import { CameraStatus, DataSource, Quality } from '../types';

export const DataSourceBadge: React.FC<{ source: DataSource; className?: string }> = ({ source, className = '' }) => {
  const isLive = source === 'LIVE';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase border ${
        isLive
          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
          : 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
      } ${className}`}
      title={isLive ? 'Live real-time AI footfall stream' : 'DEMO simulation mode (no live RTSP stream active)'}
    >
      <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {source} MODE
    </span>
  );
};

export const QualityBadge: React.FC<{ quality: Quality; className?: string }> = ({ quality, className = '' }) => {
  const styles: Record<Quality, { bg: string; text: string; border: string }> = {
    OK: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    DEGRADED: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
    INCOMPLETE: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
    RESET_REQUIRED: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-300' }
  };

  const style = styles[quality] || styles.OK;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style.bg} ${style.text} ${style.border} ${className}`}
    >
      Quality: {quality.replace('_', ' ')}
    </span>
  );
};

export const CameraStatusBadge: React.FC<{ status: CameraStatus; className?: string }> = ({ status, className = '' }) => {
  const styles: Record<CameraStatus, { bg: string; text: string; dot: string; label: string }> = {
    ONLINE: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Online' },
    CONNECTING: { bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500 animate-ping', label: 'Connecting' },
    NEEDS_SETUP: { bg: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500', label: 'Needs Setup' },
    DEGRADED: { bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Degraded' },
    OFFLINE: { bg: 'bg-slate-100 text-slate-700 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400', label: 'Offline' },
    CONFIG_ERROR: { bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500', label: 'Config Error' }
  };

  const current = styles[status] || styles.OFFLINE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${current.bg} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  );
};
