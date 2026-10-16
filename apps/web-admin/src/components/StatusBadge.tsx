import React from 'react';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const norm = (status || '').toUpperCase();

  switch (norm) {
    case 'ACTIVE':
    case 'ONLINE':
    case 'SUCCESS':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {norm}
        </span>
      );
    case 'SUSPENDED':
    case 'OFFLINE':
    case 'FAILED':
    case 'CONFIG_ERROR':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
          {norm}
        </span>
      );
    case 'CONNECTING':
    case 'DEGRADED':
    case 'NEEDS_SETUP':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          {norm}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          {norm || 'UNKNOWN'}
        </span>
      );
  }
}
